// CathedrAI native engine: a thin JNI layer over llama.cpp.
//
// Design notes
//  * Every call that can take long or crash logs a breadcrumb line to native.log
//    and flushes immediately, so after a native crash the log shows the last step.
//  * Strings that cross JNI are always passed as UTF-8 byte arrays (never
//    NewStringUTF / GetStringUTFChars on user text) because JNI's "modified UTF-8"
//    corrupts emoji and can abort the VM on invalid sequences.
//  * The KV cache is reused between turns: only the part of the prompt that
//    differs from what is already decoded gets processed again.

#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <exception>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

#include "llama.h"
#ifdef CATHEDRAI_VISION
#include "mtmd.h"
#include "mtmd-helper.h"
#endif

#define TAG "CathedrAI"

// ------------------------------------------------------------------ state
static std::mutex g_mu;                  // guards model/context lifetime + generation
static llama_model*   g_model = nullptr;
static llama_context* g_ctx   = nullptr;
static std::vector<llama_token> g_cache; // tokens currently decoded in the KV cache
static std::atomic<bool> g_stop{false};
static bool g_inited = false;
static std::string g_arch;               // general.architecture of the loaded model
static bool g_img_dirty = false;         // KV cache holds image embeddings that g_cache cannot describe
static llama_token g_stop_tok = LLAMA_TOKEN_NULL;   // <turn|> for Gemma 4
static bool g_vision = false;            // a vision projector (mmproj) is loaded
#ifdef CATHEDRAI_VISION
static mtmd_context* g_mtmd = nullptr;
#endif

static std::mutex g_log_mu;
static FILE* g_log = nullptr;
static std::string g_last_err;           // most recent llama.cpp ERROR line(s)

// ------------------------------------------------------------------ logging
static void write_log_line(const char* who, const char* text) {
    std::lock_guard<std::mutex> lk(g_log_mu);
    if (!g_log) return;
    time_t t = time(nullptr);
    struct tm tmv;
    localtime_r(&t, &tmv);
    char ts[32];
    strftime(ts, sizeof ts, "%m-%d %H:%M:%S", &tmv);
    fprintf(g_log, "%s [%s] %s\n", ts, who, text);
    fflush(g_log);
}

static void wlog(const char* fmt, ...) {
    char buf[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    __android_log_print(ANDROID_LOG_INFO, TAG, "%s", buf);
    write_log_line("native", buf);
}

static void llama_log_cb(enum ggml_log_level level, const char* text, void*) {
    if (!text) return;
    if (level == GGML_LOG_LEVEL_DEBUG || level == GGML_LOG_LEVEL_CONT) return;
    std::string s(text);
    while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();
    if (s.empty()) return;
    bool dots = true;
    for (char c : s) if (c != '.') { dots = false; break; }
    if (dots) return;
    if (level == GGML_LOG_LEVEL_ERROR) {
        std::lock_guard<std::mutex> lk(g_log_mu);
        g_last_err += s + " | ";
        if (g_last_err.size() > 700) g_last_err = g_last_err.substr(g_last_err.size() - 700);
    }
    int prio = level == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR
             : level == GGML_LOG_LEVEL_WARN  ? ANDROID_LOG_WARN : ANDROID_LOG_INFO;
    __android_log_print(prio, "llama", "%s", s.c_str());
    write_log_line(level == GGML_LOG_LEVEL_ERROR ? "llama-ERR" : level == GGML_LOG_LEVEL_WARN ? "llama-WARN" : "llama", s.c_str());
}

// ------------------------------------------------------------------ helpers
static std::string jesc(const std::string& s) {
    std::string o;
    o.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;
            default:
                if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; }
                else if (c >= 0x80) o += '?';   // keep JSON strings ASCII: safe for NewStringUTF
                else o += (char)c;
        }
    }
    return o;
}

static std::string jerr(const std::string& m) {
    return std::string("{\"ok\":false,\"error\":\"") + jesc(m) + "\"}";
}

static jstring to_jstring(JNIEnv* env, const std::string& s) { return env->NewStringUTF(s.c_str()); }

static void free_all() {
#ifdef CATHEDRAI_VISION
    if (g_mtmd)  { mtmd_free(g_mtmd);        g_mtmd = nullptr; }
#endif
    g_vision = false; g_img_dirty = false; g_arch.clear(); g_stop_tok = LLAMA_TOKEN_NULL;
    if (g_ctx)   { llama_free(g_ctx);        g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    g_cache.clear();
}

static long long now_ms() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

// Longest prefix of s that does not end in the middle of a UTF-8 sequence.
static size_t valid_utf8_prefix(const std::string& s) {
    size_t n = s.size();
    for (size_t k = 0; k < n && k < 4; k++) {
        unsigned char c = (unsigned char)s[n - 1 - k];
        if ((c & 0xC0) == 0x80) continue;                 // continuation byte, keep looking back
        size_t need = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 1;
        return need > k + 1 ? n - 1 - k : n;
    }
    return n;
}

typedef std::vector<std::pair<std::string, std::string>> Msgs;

// Apply the model's own chat template; fall back to ChatML if llama.cpp does not recognise it.
static bool format_chat(const Msgs& m, std::string& out, bool* usedFallback) {
    // Gemma 4 uses new control tokens (<|turn>role ... <turn|>) that llama.cpp's built-in
    // template matcher does not know, so build the prompt by hand (format from Google's docs).
    // The GGUF has add_bos_token=false, so the <bos> is written here.
    if (g_arch == "gemma4") {
        out = "<bos>";
        for (auto& p : m) {
            const char* role = p.first == "assistant" ? "model" : p.first == "system" ? "system" : "user";
            out += std::string("<|turn>") + role + "\n" + p.second + "<turn|>\n";
        }
        out += "<|turn>model\n";
        return true;
    }
    std::vector<llama_chat_message> cm;
    size_t total = 0;
    for (auto& p : m) {
        cm.push_back({p.first.c_str(), p.second.c_str()});
        total += p.first.size() + p.second.size() + 32;
    }
    const char* tmpl = g_model ? llama_model_chat_template(g_model, nullptr) : nullptr;
    std::string t = tmpl ? tmpl : "chatml";
    std::vector<char> buf(std::max<size_t>(4096, total * 2));
    int n = llama_chat_apply_template(t.c_str(), cm.data(), cm.size(), true, buf.data(), (int32_t)buf.size());
    if (n > (int)buf.size()) {
        buf.resize((size_t)n + 16);
        n = llama_chat_apply_template(t.c_str(), cm.data(), cm.size(), true, buf.data(), (int32_t)buf.size());
    }
    if (n < 0) {
        if (usedFallback) *usedFallback = true;
        out.clear();
        for (auto& p : m) out += "<|im_start|>" + p.first + "\n" + p.second + "<|im_end|>\n";
        out += "<|im_start|>assistant\n";
        return true;
    }
    out.assign(buf.data(), (size_t)n);
    return true;
}

static bool tokenize(const llama_vocab* v, const std::string& s, bool addSpecial, std::vector<llama_token>& out) {
    out.clear();
    if (s.empty()) return true;
    int n = -llama_tokenize(v, s.c_str(), (int32_t)s.size(), nullptr, 0, addSpecial, true);
    if (n <= 0) return false;
    out.resize((size_t)n);
    int r = llama_tokenize(v, s.c_str(), (int32_t)s.size(), out.data(), (int32_t)out.size(), addSpecial, true);
    if (r < 0) return false;
    out.resize((size_t)r);
    return true;
}

// ------------------------------------------------------------------ JNI: init / info
extern "C" JNIEXPORT jboolean JNICALL
Java_com_cathedrai_app_LlamaBridge_nInit(JNIEnv* env, jclass, jstring jpath) {
    try {
        if (g_inited) return JNI_TRUE;
        if (jpath) {
            const char* p = env->GetStringUTFChars(jpath, nullptr);
            if (p && *p) {
                std::lock_guard<std::mutex> lk(g_log_mu);
                g_log = fopen(p, "a");
            }
            if (p) env->ReleaseStringUTFChars(jpath, p);
        }
        llama_log_set(llama_log_cb, nullptr);
        llama_backend_init();
        g_inited = true;
        wlog("engine init ok. %s", llama_print_system_info());
        return JNI_TRUE;
    } catch (...) {
        return JNI_FALSE;
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_cathedrai_app_LlamaBridge_nVisionCompiled(JNIEnv*, jclass) {
#ifdef CATHEDRAI_VISION
    return JNI_TRUE;
#else
    return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_cathedrai_app_LlamaBridge_nSystemInfo(JNIEnv* env, jclass) {
    try {
        return to_jstring(env, jesc(llama_print_system_info()));
    } catch (...) {
        return to_jstring(env, "");
    }
}

// ------------------------------------------------------------------ JNI: load / unload / stop
extern "C" JNIEXPORT jstring JNICALL
Java_com_cathedrai_app_LlamaBridge_nLoad(JNIEnv* env, jclass, jstring jpath, jint nCtx, jint nThreads, jstring jproj) {
    std::string path;
    {
        const char* p = env->GetStringUTFChars(jpath, nullptr);
        if (p) { path = p; env->ReleaseStringUTFChars(jpath, p); }
    }
    std::string projPath;
    if (jproj) {
        const char* q = env->GetStringUTFChars(jproj, nullptr);
        if (q) { projPath = q; env->ReleaseStringUTFChars(jproj, q); }
    }
    try {
        std::lock_guard<std::mutex> lk(g_mu);
        free_all();
        { std::lock_guard<std::mutex> l2(g_log_mu); g_last_err.clear(); }
        long long t0 = now_ms();
        wlog("LOAD begin path=%s nCtx=%d threads=%d", path.c_str(), (int)nCtx, (int)nThreads);

        llama_model_params mp = llama_model_default_params();
        mp.n_gpu_layers = 0;       // CPU-only build
        mp.use_mmap = true;
        g_model = llama_model_load_from_file(path.c_str(), mp);
        if (!g_model) {
            std::string why;
            { std::lock_guard<std::mutex> l2(g_log_mu); why = g_last_err; }
            wlog("LOAD failed: model could not be loaded");
            return to_jstring(env, jerr("llama.cpp could not load this model file. " + why +
                "(If the log mentions an unknown architecture, this model is newer than the bundled engine.)"));
        }
        wlog("LOAD model read in %lld ms", now_ms() - t0);
        { char ab[64] = {0}; if (llama_model_meta_val_str(g_model, "general.architecture", ab, sizeof ab) > 0) g_arch = ab; }
        if (g_arch == "gemma4") {
            std::vector<llama_token> st;
            if (tokenize(llama_model_get_vocab(g_model), "<turn|>", false, st) && st.size() == 1) { g_stop_tok = st[0]; wlog("gemma4 end-of-turn token id=%d", (int)st[0]); }
        }

        int train = llama_model_n_ctx_train(g_model);
        int want = nCtx > 0 ? (int)nCtx : 4096;
        if (train > 0 && want > train) want = train;
        if (want < 256) want = 256;

        llama_context_params cp = llama_context_default_params();
        cp.n_ctx = (uint32_t)want;
        cp.n_batch = 512;
        cp.n_ubatch = 512;
        cp.n_threads = nThreads > 0 ? nThreads : 4;
        cp.n_threads_batch = cp.n_threads;
        g_ctx = llama_init_from_model(g_model, cp);
        if (!g_ctx) {
            std::string why;
            { std::lock_guard<std::mutex> l2(g_log_mu); why = g_last_err; }
            llama_model_free(g_model);
            g_model = nullptr;
            wlog("LOAD failed: context could not be created (n_ctx=%d)", want);
            return to_jstring(env, jerr("Could not create the context (n_ctx=" + std::to_string(want) +
                "). Probably not enough free RAM: lower Context size and try again. " + why));
        }

        char desc[256];
        llama_model_desc(g_model, desc, sizeof desc);
        const char* tmpl = llama_model_chat_template(g_model, nullptr);
        const char* tstate = "none";
        if (tmpl) {
            llama_chat_message m1 = {"user", "hi"};
            char tb[16];
            tstate = llama_chat_apply_template(tmpl, &m1, 1, true, tb, (int32_t)sizeof tb) < 0 ? "fallback" : "recognized";
        }
        const llama_vocab* vocab = llama_model_get_vocab(g_model);
        wlog("LOAD ok in %lld ms: %s | n_ctx=%d (train %d) | chat template: %s", now_ms() - t0, desc, want, train, tstate);

        std::string visionErr;
#ifdef CATHEDRAI_VISION
        if (!projPath.empty()) {
            mtmd_context_params vp = mtmd_context_params_default();
            vp.use_gpu = false;
            vp.n_threads = cp.n_threads;
            g_mtmd = mtmd_init_from_file(projPath.c_str(), g_model, vp);
            if (g_mtmd) { g_vision = true; wlog("LOAD vision projector ok: %s", projPath.c_str()); }
            else { visionErr = "the vision projector could not be loaded (wrong file for this model?)"; wlog("LOAD vision projector FAILED: %s", projPath.c_str()); }
        }
#else
        if (!projPath.empty()) visionErr = "this build of the engine was compiled without image support";
#endif
        std::string j = "{\"ok\":true";
        j += ",\"arch\":\"" + jesc(g_arch) + "\"";
        j += std::string(",\"vision\":") + (g_vision ? "true" : "false");
        j += ",\"visionErr\":\"" + jesc(visionErr) + "\"";
        j += ",\"ctx\":" + std::to_string(want);
        j += ",\"train\":" + std::to_string(train);
        j += ",\"vocab\":" + std::to_string(llama_vocab_n_tokens(vocab));
        j += ",\"params\":" + std::to_string((unsigned long long)llama_model_n_params(g_model));
        j += ",\"size\":" + std::to_string((unsigned long long)llama_model_size(g_model));
        j += ",\"ms\":" + std::to_string(now_ms() - t0);
        j += ",\"desc\":\"" + jesc(desc) + "\"";
        j += ",\"template\":\"" + std::string(tstate) + "\"}";
        return to_jstring(env, j);
    } catch (const std::exception& e) {
        free_all();
        wlog("LOAD exception: %s", e.what());
        return to_jstring(env, jerr(std::string("Exception while loading: ") + e.what()));
    } catch (...) {
        free_all();
        wlog("LOAD unknown exception");
        return to_jstring(env, jerr("Unknown exception while loading"));
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_cathedrai_app_LlamaBridge_nUnload(JNIEnv*, jclass) {
    try {
        std::lock_guard<std::mutex> lk(g_mu);
        free_all();
        wlog("UNLOAD done");
    } catch (...) {}
}

extern "C" JNIEXPORT void JNICALL
Java_com_cathedrai_app_LlamaBridge_nStop(JNIEnv*, jclass) {
    g_stop.store(true);
}

// ------------------------------------------------------------------ JNI: generate
extern "C" JNIEXPORT jstring JNICALL
Java_com_cathedrai_app_LlamaBridge_nGenerate(JNIEnv* env, jclass,
        jobjectArray roles, jobjectArray contents,
        jfloat temp, jfloat topP, jint topK, jfloat repeatPen,
        jint maxNew, jint seed, jobjectArray imgs, jintArray imgW, jintArray imgH, jobject cb) {
    // ---- images (RGB bytes) for the last user message
    std::vector<std::vector<unsigned char>> imgData;
    std::vector<std::pair<int,int>> imgDim;
    if (imgs && imgW && imgH) {
        jsize ni = env->GetArrayLength(imgs);
        std::vector<jint> w((size_t)ni), h((size_t)ni);
        if (ni > 0) { env->GetIntArrayRegion(imgW, 0, ni, w.data()); env->GetIntArrayRegion(imgH, 0, ni, h.data()); }
        for (jsize i = 0; i < ni; i++) {
            jbyteArray jb = (jbyteArray)env->GetObjectArrayElement(imgs, i);
            if (!jb) continue;
            jsize len = env->GetArrayLength(jb);
            std::vector<unsigned char> d((size_t)len);
            if (len > 0) env->GetByteArrayRegion(jb, 0, len, reinterpret_cast<jbyte*>(d.data()));
            env->DeleteLocalRef(jb);
            if ((size_t)len == (size_t)w[i] * (size_t)h[i] * 3) { imgData.push_back(std::move(d)); imgDim.emplace_back(w[i], h[i]); }
        }
    }
    // ---- copy arguments out of JNI first
    Msgs msgs;
    jsize nMsg = env->GetArrayLength(roles);
    for (jsize i = 0; i < nMsg; i++) {
        jstring jr = (jstring)env->GetObjectArrayElement(roles, i);
        std::string role = "user";
        if (jr) {
            const char* c = env->GetStringUTFChars(jr, nullptr);
            if (c) { role = c; env->ReleaseStringUTFChars(jr, c); }
            env->DeleteLocalRef(jr);
        }
        jbyteArray jb = (jbyteArray)env->GetObjectArrayElement(contents, i);
        std::string content;
        if (jb) {
            jsize len = env->GetArrayLength(jb);
            content.assign((size_t)len, '\0');
            if (len > 0) env->GetByteArrayRegion(jb, 0, len, reinterpret_cast<jbyte*>(&content[0]));
            env->DeleteLocalRef(jb);
        }
        msgs.emplace_back(role, content);
    }
    jclass cbc = env->GetObjectClass(cb);
    jmethodID mTok = env->GetMethodID(cbc, "onToken", "([B)Z");
    jmethodID mPre = env->GetMethodID(cbc, "onPrefill", "(II)V");
    if (!mTok || !mPre) return to_jstring(env, jerr("internal: callback methods not found"));

    try {
        std::lock_guard<std::mutex> lk(g_mu);
        if (!g_model || !g_ctx) return to_jstring(env, jerr("No model is loaded."));
        g_stop.store(false);

        const llama_vocab* vocab = llama_model_get_vocab(g_model);
        const int nCtx = (int)llama_n_ctx(g_ctx);
        const int nBatch = 512;
        int maxN = maxNew > 0 ? maxNew : 512;
        const int reserve = std::max(64, std::min(maxN, nCtx / 3));
        const int budget = nCtx - reserve;

        // ---- build prompt, dropping the oldest turns until it fits
        std::vector<llama_token> prompt;
        int trimmed = 0;
        bool fallback = false;
        std::string lastText;
        const bool useImg = !imgData.empty() && g_vision;
        std::string imgNote;
        if (!imgData.empty() && !g_vision) imgNote = "no-vision";
        for (;;) {
            std::string text;
#ifdef CATHEDRAI_VISION
            if (useImg) {
                // put one media marker per image at the start of the last user message
                for (int k = (int)msgs.size() - 1; k >= 0; k--) if (msgs[k].first == "user") {
                    std::string mk;
                    for (size_t q = 0; q < imgData.size(); q++) mk += std::string(mtmd_default_marker()) + "\n";
                    if (msgs[k].second.compare(0, mk.size(), mk) != 0) msgs[k].second = mk + msgs[k].second;
                    break;
                }
            }
#endif
            format_chat(msgs, text, &fallback);
            lastText = text;
            if (!tokenize(vocab, text, true, prompt) || prompt.empty())
                return to_jstring(env, jerr("Could not tokenize the prompt."));
            llama_token bos = llama_vocab_bos(vocab);
            if (prompt.size() >= 2 && bos != LLAMA_TOKEN_NULL && prompt[0] == bos && prompt[1] == bos)
                prompt.erase(prompt.begin());
            if ((int)prompt.size() <= budget) break;
            size_t first = (!msgs.empty() && msgs[0].first == "system") ? 1 : 0;
            if (msgs.size() <= first + 1)
                return to_jstring(env, jerr("Your message is too long for the context window (" +
                    std::to_string(prompt.size()) + " tokens, limit " + std::to_string(budget) +
                    "). Raise Context size under Appoint Your Saint, or send less text."));
            msgs.erase(msgs.begin() + first); trimmed++;
            if (msgs.size() > first + 1 && msgs[first].first == "assistant") { msgs.erase(msgs.begin() + first); trimmed++; }
        }
        wlog("GEN begin: prompt=%d tokens, trimmed=%d, ctx=%d, maxNew=%d, templateFallback=%d",
             (int)prompt.size(), trimmed, nCtx, maxN, fallback ? 1 : 0);

        if (g_img_dirty) {   // an earlier image turn left embeddings in the cache that tokens cannot describe
            llama_memory_clear(llama_get_memory(g_ctx), true);
            g_cache.clear();
            g_img_dirty = false;
        }
        int pos = 0;         // number of positions currently in the KV cache
        bool imgDone = false;
        long long ti0 = now_ms();
#ifdef CATHEDRAI_VISION
        if (useImg) {
            llama_memory_clear(llama_get_memory(g_ctx), true);
            g_cache.clear();
            std::vector<mtmd_bitmap*> bms;
            for (size_t q = 0; q < imgData.size(); q++)
                bms.push_back(mtmd_bitmap_init((uint32_t)imgDim[q].first, (uint32_t)imgDim[q].second, imgData[q].data()));
            mtmd_input_chunks* chunks = mtmd_input_chunks_init();
            mtmd_input_text it;
            it.text = lastText.c_str();
            it.add_special = true;
            it.parse_special = true;
            std::vector<const mtmd_bitmap*> cb2(bms.begin(), bms.end());
            int32_t tr = mtmd_tokenize(g_mtmd, chunks, &it, cb2.data(), cb2.size());
            auto cleanup = [&]() { mtmd_input_chunks_free(chunks); for (auto* b : bms) mtmd_bitmap_free(b); };
            if (tr != 0) { cleanup(); wlog("GEN image tokenize failed rc=%d", (int)tr); return to_jstring(env, jerr("Could not prepare the image (tokenizer code " + std::to_string(tr) + ").")); }
            size_t nTok = mtmd_helper_get_n_tokens(chunks);
            wlog("GEN image prompt: %d images, %d tokens", (int)imgData.size(), (int)nTok);
            if ((int)nTok > budget) { cleanup(); return to_jstring(env, jerr("The image and your message need " + std::to_string(nTok) + " tokens but only " + std::to_string(budget) + " fit. Raise Context size under Appoint Your Saint.")); }
            llama_pos newPast = 0;
            int32_t er = mtmd_helper_eval_chunks(g_mtmd, g_ctx, chunks, 0, 0, nBatch, true, &newPast);
            cleanup();
            if (er != 0) { llama_memory_clear(llama_get_memory(g_ctx), true); wlog("GEN image eval failed rc=%d", (int)er); return to_jstring(env, jerr("The model could not read the image (code " + std::to_string(er) + "). Is the vision projector the right one for this model?")); }
            pos = (int)newPast;
            g_img_dirty = true;
            imgDone = true;
            env->CallVoidMethod(cb, mPre, (jint)pos, (jint)pos);
            if (env->ExceptionCheck()) env->ExceptionClear();
            wlog("GEN image prefill done in %lld ms, pos=%d", now_ms() - ti0, pos);
        }
#endif

        // ---- reuse whatever is already in the KV cache
        size_t common = 0;
        llama_memory_t mem = llama_get_memory(g_ctx);
        if (!imgDone) {
        while (common < g_cache.size() && common < prompt.size() && g_cache[common] == prompt[common]) common++;
        if (common >= prompt.size()) common = prompt.size() - 1;   // always decode at least one token for logits
        }
        if (!imgDone && common < g_cache.size()) {
            if (!llama_memory_seq_rm(mem, 0, (llama_pos)common, -1)) {
                llama_memory_clear(mem, true);
                common = 0;
                g_cache.clear();
            }
        }
        if (!imgDone) g_cache.resize(common);
        const size_t reused = imgDone ? 0 : common;

        // ---- sampler
        llama_sampler* smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
        if (repeatPen > 1.0f) llama_sampler_chain_add(smpl, llama_sampler_init_penalties(64, repeatPen, 0.0f, 0.0f));
        if (temp <= 0.01f) {
            llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
        } else {
            if (topK > 0) llama_sampler_chain_add(smpl, llama_sampler_init_top_k(topK));
            if (topP > 0.0f && topP < 1.0f) llama_sampler_chain_add(smpl, llama_sampler_init_top_p(topP, 1));
            llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp));
            llama_sampler_chain_add(smpl, llama_sampler_init_dist(seed < 0 ? LLAMA_DEFAULT_SEED : (uint32_t)seed));
        }
        for (size_t i = prompt.size() > 64 ? prompt.size() - 64 : 0; i < prompt.size(); i++) llama_sampler_accept(smpl, prompt[i]);

        // ---- prefill (process the new part of the prompt)
        long long t0 = now_ms();
        const int total = imgDone ? pos : (int)prompt.size();
        int used = imgDone ? pos : 0;   // positions in the KV cache (only tracked on the image path)
        for (size_t i = imgDone ? prompt.size() : common; i < prompt.size(); i += nBatch) {
            if (g_stop.load()) { llama_sampler_free(smpl); return to_jstring(env,
                "{\"ok\":true,\"gen\":0,\"reason\":\"user\",\"prompt\":" + std::to_string(total) + ",\"reused\":" + std::to_string(reused) +
                ",\"trimmed\":" + std::to_string(trimmed) + ",\"tps\":0}"); }
            int n = (int)std::min<size_t>((size_t)nBatch, prompt.size() - i);
            wlog("GEN prefill %d..%d of %d", (int)i, (int)i + n, total);
            if (llama_decode(g_ctx, llama_batch_get_one(prompt.data() + i, n)) != 0) {
                llama_memory_clear(mem, true);
                g_cache.clear();
                llama_sampler_free(smpl);
                wlog("GEN prefill decode FAILED");
                return to_jstring(env, jerr("llama_decode failed while reading the prompt (likely out of memory)."));
            }
            g_cache.insert(g_cache.end(), prompt.begin() + i, prompt.begin() + i + n);
            env->CallVoidMethod(cb, mPre, (jint)(i + n), (jint)total);
            if (env->ExceptionCheck()) env->ExceptionClear();
        }
        long long t1 = now_ms();
        wlog("GEN prefill done in %lld ms (%d new tokens, %d reused)", t1 - t0, total - (int)reused, (int)reused);

        // ---- decode loop
        int gen = 0;
        std::string pending;
        const char* reason = "length";
        for (int it = 0; it < maxN; it++) {
            if (g_stop.load()) { reason = "user"; break; }
            llama_token tok = llama_sampler_sample(smpl, g_ctx, -1);
            if (llama_vocab_is_eog(vocab, tok) || tok == g_stop_tok) { reason = "eos"; break; }

            char pb[256];
            int pn = llama_token_to_piece(vocab, tok, pb, (int32_t)sizeof pb, 0, false);
            if (pn < 0) {
                std::vector<char> big((size_t)(-pn) + 8);
                pn = llama_token_to_piece(vocab, tok, big.data(), (int32_t)big.size(), 0, false);
                if (pn > 0) pending.append(big.data(), (size_t)pn);
            } else if (pn > 0) {
                pending.append(pb, (size_t)pn);
            }
            size_t cut = valid_utf8_prefix(pending);
            if (cut > 0) {
                jbyteArray arr = env->NewByteArray((jsize)cut);
                env->SetByteArrayRegion(arr, 0, (jsize)cut, reinterpret_cast<const jbyte*>(pending.data()));
                jboolean cont = env->CallBooleanMethod(cb, mTok, arr);
                env->DeleteLocalRef(arr);
                if (env->ExceptionCheck()) { env->ExceptionClear(); reason = "user"; gen++; break; }
                pending.erase(0, cut);
                (void)cont;
            }
            gen++;

            if ((imgDone ? used + gen : (int)g_cache.size() + 1) >= nCtx - 1) { reason = "ctx"; break; }
            if (llama_decode(g_ctx, llama_batch_get_one(&tok, 1)) != 0) {
                wlog("GEN decode FAILED at token %d", gen);
                llama_memory_clear(mem, true);
                g_cache.clear();
                llama_sampler_free(smpl);
                return to_jstring(env, jerr("llama_decode failed while generating."));
            }
            if (!imgDone) g_cache.push_back(tok);
            if (gen % 32 == 0) wlog("GEN %d tokens...", gen);
        }
        if (!pending.empty()) {   // flush any trailing bytes
            jbyteArray arr = env->NewByteArray((jsize)pending.size());
            env->SetByteArrayRegion(arr, 0, (jsize)pending.size(), reinterpret_cast<const jbyte*>(pending.data()));
            env->CallBooleanMethod(cb, mTok, arr);
            env->DeleteLocalRef(arr);
            if (env->ExceptionCheck()) env->ExceptionClear();
        }
        llama_sampler_free(smpl);

        long long t2 = now_ms();
        double secs = (t2 - t1) / 1000.0;
        double tps = secs > 0.001 ? gen / secs : 0.0;
        double pps = (t1 - t0) > 0 ? (double)(total - (int)reused) / ((t1 - t0) / 1000.0) : 0.0;
        wlog("GEN done: %d tokens in %lld ms (%.1f tok/s), reason=%s, prefill %.1f tok/s", gen, t2 - t1, tps, reason, pps);
        char nb[64];
        snprintf(nb, sizeof nb, "%.1f", tps);
        char pb2[64];
        snprintf(pb2, sizeof pb2, "%.1f", pps);
        std::string j = "{\"ok\":true,\"gen\":" + std::to_string(gen);
        j += ",\"reason\":\"" + std::string(reason) + "\"";
        j += ",\"prompt\":" + std::to_string(total);
        j += ",\"reused\":" + std::to_string(reused);
        j += ",\"trimmed\":" + std::to_string(trimmed);
        j += std::string(",\"imgIgnored\":") + (imgNote.empty() ? "false" : "true");
        j += ",\"msPrefill\":" + std::to_string(t1 - t0);
        j += ",\"msGen\":" + std::to_string(t2 - t1);
        j += ",\"tps\":" + std::string(nb);
        j += ",\"pps\":" + std::string(pb2) + "}";
        return to_jstring(env, j);
    } catch (const std::exception& e) {
        wlog("GEN exception: %s", e.what());
        g_cache.clear();
        return to_jstring(env, jerr(std::string("Exception while generating: ") + e.what()));
    } catch (...) {
        wlog("GEN unknown exception");
        g_cache.clear();
        return to_jstring(env, jerr("Unknown exception while generating"));
    }
}
