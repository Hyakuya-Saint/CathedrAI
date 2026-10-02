package com.cathedrai.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
import android.provider.OpenableColumns;
import android.view.WindowManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Cathedra")
public class CathedraPlugin extends Plugin {

    /** Single-threaded executors: Capacitor runs plugin methods on one shared thread, so long work must not run there. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();   // import / download / listing / diagnostics
    private final ExecutorService llm = Executors.newSingleThreadExecutor();  // load / generate / unload

    private volatile boolean cancelXfer = false;
    private volatile String loadedPath = null;
    private int awake = 0;

    private String startupOp = null;
    private String startupExit = null;

    // ------------------------------------------------------------------ lifecycle

    @Override
    public void load() {
        Diag.init(getContext());
        String inflight = Diag.takeInflight();
        java.util.List<String> exits = Diag.exitReasons(getContext(), 6);
        if (inflight != null) {
            startupOp = inflight;
            startupExit = exits.isEmpty() ? "" : exits.get(0);
            Diag.incident("The app process ended in the middle of:\n" + inflight
                    + "\nMost recent OS exit record:\n" + startupExit);
        }
        if (LlamaBridge.loaded) {
            try {
                LlamaBridge.nInit(Diag.path("native.log"));
            } catch (Throwable t) {
                Diag.log("engine", "nInit failed: " + t);
            }
        } else {
            Diag.log("engine", "native library did not load: " + LlamaBridge.loadError);
        }
    }

    // ------------------------------------------------------------------ small helpers

    private File modelsDir() {
        File d = new File(getContext().getFilesDir(), "models");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private long freeBytes() {
        try {
            return new StatFs(modelsDir().getAbsolutePath()).getAvailableBytes();
        } catch (Throwable t) {
            return -1;
        }
    }

    private long availMemMb() {
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            return mi.availMem / (1024 * 1024);
        } catch (Throwable t) {
            return -1;
        }
    }

    private static String fmt(long b) {
        if (b >= 1000000000L) return String.format(Locale.US, "%.2f GB", b / 1e9);
        if (b >= 1000000L) return String.format(Locale.US, "%d MB", b / 1000000L);
        return b + " B";
    }

    private static String msg(Throwable t) {
        String m = t.getMessage();
        if (m == null || m.isEmpty()) m = t.getClass().getSimpleName();
        return m;
    }

    private static JSObject err(String m) {
        JSObject o = new JSObject();
        o.put("ok", false);
        o.put("error", m);
        return o;
    }

    private static String safeName(String n) {
        if (n == null) n = "model.gguf";
        int slash = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
        if (slash >= 0) n = n.substring(slash + 1);
        n = n.replaceAll("[^A-Za-z0-9._+()\\- ]", "_").trim();
        if (n.length() > 120) n = n.substring(n.length() - 120);
        if (n.isEmpty()) n = "model";
        if (!n.toLowerCase(Locale.US).endsWith(".gguf")) n = n + ".gguf";
        return n;
    }

    private synchronized void keepAwake(boolean on) {
        awake += on ? 1 : -1;
        if (awake < 0) awake = 0;
        final boolean flag = awake > 0;
        final Activity a = getActivity();
        if (a == null) return;
        a.runOnUiThread(() -> {
            if (flag) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void emit(String id, String phase, long bytes, long total, double bps) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("phase", phase);
        o.put("bytes", bytes);
        o.put("total", total);
        o.put("bps", bps);
        notifyListeners("progress", o);
    }

    private static final class Cpu {
        boolean known, dotprod, i8mm, fp16;
        String features = "";
    }

    private Cpu cpu() {
        Cpu c = new Cpu();
        try (BufferedReader br = new BufferedReader(new FileReader("/proc/cpuinfo"))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (line.startsWith("Features")) {
                    int i = line.indexOf(':');
                    c.features = i >= 0 ? line.substring(i + 1).trim() : line;
                    break;
                }
            }
        } catch (Throwable ignored) { }
        if (!c.features.isEmpty()) {
            c.known = true;
            String f = " " + c.features + " ";
            c.dotprod = f.contains(" asimddp ");
            c.i8mm = f.contains(" i8mm ");
            c.fp16 = f.contains(" asimdhp ") || f.contains(" fphp ");
        }
        return c;
    }

    private int defaultThreads() {
        return Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors()));
    }

    // ------------------------------------------------------------------ logging from the web UI

    @PluginMethod
    public void log(PluginCall call) {
        Diag.log(call.getString("tag", "js"), call.getString("msg", ""));
        call.resolve();
    }

    @PluginMethod
    public void getStartupNotice(PluginCall call) {
        JSObject o = new JSObject();
        o.put("op", startupOp == null ? "" : startupOp);
        o.put("exit", startupExit == null ? "" : startupExit);
        startupOp = null;
        startupExit = null;
        call.resolve(o);
    }

    // ------------------------------------------------------------------ picking a file

    @PluginMethod
    public void pickModel(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        Diag.log("pick", "opening the system file picker");
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
                Diag.log("pick", "cancelled");
                JSObject o = new JSObject();
                o.put("cancelled", true);
                call.resolve(o);
                return;
            }
            Uri uri = data.getData();
            try {
                getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Throwable ignored) { }
            String name = "model.gguf";
            long size = -1;
            try (Cursor c = getContext().getContentResolver().query(uri,
                    new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni);
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
                }
            }
            Diag.log("pick", "picked name=" + name + " size=" + size + " uri=" + uri);
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            o.put("name", name);
            o.put("size", size);
            call.resolve(o);
        } catch (Throwable t) {
            Diag.log("pick", "FAILED " + t);
            call.reject("File picker failed: " + msg(t));
        }
    }

    // ------------------------------------------------------------------ import (copy into app storage)

    @PluginMethod
    public void importModel(final PluginCall call) {
        final String id = call.getString("id", "");
        final String uriS = call.getString("uri");
        final String name = safeName(call.getString("name", "model.gguf"));
        if (uriS == null) {
            call.reject("No file was selected");
            return;
        }
        cancelXfer = false;
        io.execute(() -> {
            final String op = Diag.begin("import " + name);
            keepAwake(true);
            final File part = new File(modelsDir(), name + ".part");
            try {
                Uri uri = Uri.parse(uriS);
                ContentResolver cr = getContext().getContentResolver();
                long total = -1;
                try (Cursor c = cr.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
                    if (c != null && c.moveToFirst() && !c.isNull(0)) total = c.getLong(0);
                }
                Diag.log("import", "start name=" + name + " total=" + total + " free=" + freeBytes() + " availMem=" + availMemMb() + "MB");
                emit(id, "verify", 0, total, 0);

                try (InputStream in = cr.openInputStream(uri)) {
                    if (in == null) throw new IOException("Android could not open that file (the provider returned nothing)");
                    byte[] buf = new byte[1 << 20];
                    int n = readAtLeast(in, buf, 16);
                    if (n < 16) throw new IOException("That file is too small to be a model (" + n + " bytes)");
                    byte[] head = new byte[8];
                    System.arraycopy(buf, 0, head, 0, 8);
                    GgufInfo.checkMagic(head, name);
                    Diag.log("import", "header is a valid GGUF header");
                    if (total > 0) {
                        long need = total + 128L * 1024 * 1024;
                        long free = freeBytes();
                        if (free >= 0 && free < need)
                            throw new IOException("Not enough free storage: the model needs " + fmt(need) + " but only " + fmt(free) + " is free.");
                    }
                    long done = copy(in, buf, n, part, total, id, "copy", false, 0);
                    Diag.log("import", "copied " + done + " bytes");
                }
                emit(id, "verify", 0, total, 0);
                JSObject res = finalizeModel(part, name, total);
                Diag.log("import", "OK " + res.getString("path"));
                call.resolve(res);
            } catch (Throwable t) {
                Diag.log("import", "FAILED " + t);
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                call.reject(msg(t));
            } finally {
                keepAwake(false);
                Diag.end(op);
            }
        });
    }

    private static int readAtLeast(InputStream in, byte[] buf, int min) throws IOException {
        int off = 0;
        while (off < min) {
            int r = in.read(buf, off, buf.length - off);
            if (r < 0) break;
            off += r;
        }
        return off;
    }

    /** Streams `in` to `part`. `pre` bytes already sit at the start of buf and are written first. */
    private long copy(InputStream in, byte[] buf, int pre, File part, long total, String id, String phase,
                      boolean append, long base) throws IOException {
        try (FileOutputStream out = new FileOutputStream(part, append)) {
            long done = base;
            long tl = System.nanoTime();
            long lastBytes = done;
            long lastLog = done;
            if (pre > 0) {
                out.write(buf, 0, pre);
                done += pre;
            }
            while (true) {
                if (cancelXfer) throw new IOException("Cancelled");
                int r = in.read(buf);
                if (r < 0) break;
                out.write(buf, 0, r);
                done += r;
                long now = System.nanoTime();
                if (now - tl > 250000000L) {
                    double bps = (done - lastBytes) / ((now - tl) / 1e9);
                    emit(id, phase, done, total, bps);
                    tl = now;
                    lastBytes = done;
                }
                if (done - lastLog >= 256L * 1024 * 1024) {
                    lastLog = done;
                    Diag.log(phase, (done / 1048576) + " MB so far, availMem=" + availMemMb() + "MB");
                }
            }
            out.flush();
            out.getFD().sync();
            return done;
        }
    }

    private JSObject finalizeModel(File part, String name, long expected) throws IOException {
        long size = part.length();
        if (expected > 0 && size != expected)
            throw new IOException("The copy is incomplete: got " + size + " of " + expected + " bytes");
        GgufInfo g = GgufInfo.read(part);
        File dest = new File(modelsDir(), name);
        if (dest.exists() && !dest.delete()) throw new IOException("Could not replace the existing file " + name);
        if (!part.renameTo(dest)) throw new IOException("Could not finish the file (rename failed)");
        JSObject o = new JSObject();
        o.put("ok", true);
        o.put("path", dest.getAbsolutePath());
        o.put("file", name);
        o.put("size", dest.length());
        o.put("meta", g.toJson());
        return o;
    }

    // ------------------------------------------------------------------ download (resumable)

    private static final class Fatal extends IOException {
        Fatal(String m) { super(m); }
    }

    @PluginMethod
    public void downloadModel(final PluginCall call) {
        final String id = call.getString("id", "");
        final String url = call.getString("url");
        final String name = safeName(call.getString("file", "model.gguf"));
        final String token = call.getString("token");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Only https links are supported");
            return;
        }
        cancelXfer = false;
        io.execute(() -> {
            final String op = Diag.begin("download " + name + " from " + url);
            keepAwake(true);
            final File part = new File(modelsDir(), name + ".part");
            try {
                long total = -1;
                IOException last = null;
                boolean complete = false;
                for (int attempt = 1; attempt <= 8 && !complete; attempt++) {
                    if (cancelXfer) throw new IOException("Cancelled");
                    long have = part.exists() ? part.length() : 0;
                    HttpURLConnection c = null;
                    try {
                        c = (HttpURLConnection) new URL(url).openConnection();
                        c.setInstanceFollowRedirects(true);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "CathedrAI/0.2 (Android)");
                        if (token != null && !token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
                        if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
                        int code = c.getResponseCode();
                        Diag.log("download", "attempt " + attempt + " HTTP " + code + " have=" + have);
                        if (code == 416) {            // our partial file is not valid for this server: start over
                            //noinspection ResultOfMethodCallIgnored
                            part.delete();
                            continue;
                        }
                        if (code == 401 || code == 403)
                            throw new Fatal("Access denied (HTTP " + code + "). This model may need a login or licence acceptance on the website.");
                        if (code == 404) throw new Fatal("Link not found (HTTP 404). Check the address.");
                        if (code != 200 && code != 206) throw new IOException("Server answered HTTP " + code);
                        boolean resumed = code == 206;
                        if (!resumed) have = 0;
                        if (resumed) {
                            String cr = c.getHeaderField("Content-Range");   // bytes 100-999/1000
                            int slash = cr == null ? -1 : cr.lastIndexOf('/');
                            if (slash >= 0) {
                                try { total = Long.parseLong(cr.substring(slash + 1).trim()); } catch (NumberFormatException ignored) { }
                            }
                        } else {
                            total = c.getContentLengthLong();
                        }
                        if (total > 0) {
                            long need = (total - have) + 128L * 1024 * 1024;
                            long free = freeBytes();
                            if (free >= 0 && free < need)
                                throw new Fatal("Not enough free storage: need " + fmt(need) + ", only " + fmt(free) + " is free.");
                        }
                        try (InputStream in = c.getInputStream()) {
                            long done = copy(in, new byte[1 << 20], 0, part, total, id, "download", resumed, have);
                            if (total > 0 && done < total) throw new IOException("Connection ended early at " + fmt(done) + " of " + fmt(total));
                        }
                        complete = true;
                    } catch (Fatal f) {
                        throw f;
                    } catch (IOException e) {
                        if (cancelXfer || "Cancelled".equals(e.getMessage())) throw e;
                        last = e;
                        Diag.log("download", "attempt " + attempt + " interrupted: " + e);
                        try { Thread.sleep(Math.min(8000, 1500L * attempt)); } catch (InterruptedException ie) { throw new IOException("Cancelled"); }
                    } finally {
                        if (c != null) c.disconnect();
                    }
                }
                if (!complete) throw new IOException("Download kept failing: " + (last == null ? "unknown error" : msg(last))
                        + ". The partial file is kept: tap Download again to resume.");
                emit(id, "verify", 0, total, 0);
                JSObject res;
                try {
                    res = finalizeModel(part, name, total);
                } catch (IOException e) {
                    //noinspection ResultOfMethodCallIgnored
                    part.delete();     // a finished download that is not a valid model is useless: do not resume it
                    throw e;
                }
                Diag.log("download", "OK " + res.getString("path"));
                call.resolve(res);
            } catch (Throwable t) {
                Diag.log("download", "FAILED " + t);
                call.reject(msg(t));
            } finally {
                keepAwake(false);
                Diag.end(op);
            }
        });
    }

    @PluginMethod
    public void cancelTransfer(PluginCall call) {
        cancelXfer = true;
        Diag.log("xfer", "cancel requested");
        call.resolve();
    }

    // ------------------------------------------------------------------ models on disk

    @PluginMethod
    public void listModels(final PluginCall call) {
        io.execute(() -> {
            try {
                JSArray arr = new JSArray();
                File[] fs = modelsDir().listFiles();
                if (fs != null) {
                    for (File f : fs) {
                        String n = f.getName();
                        boolean partial = n.endsWith(".part");
                        if (!partial && !n.toLowerCase(Locale.US).endsWith(".gguf")) continue;
                        JSObject o = new JSObject();
                        o.put("file", partial ? n.substring(0, n.length() - 5) : n);
                        o.put("path", f.getAbsolutePath());
                        o.put("size", f.length());
                        o.put("partial", partial);
                        if (!partial) {
                            try {
                                o.put("meta", GgufInfo.read(f).toJson());
                            } catch (Throwable t) {
                                o.put("bad", msg(t));
                            }
                        }
                        arr.put(o);
                    }
                }
                JSObject res = new JSObject();
                res.put("models", arr);
                call.resolve(res);
            } catch (Throwable t) {
                call.reject(msg(t));
            }
        });
    }

    @PluginMethod
    public void deleteModel(final PluginCall call) {
        final String file = safeName(call.getString("file", ""));
        io.execute(() -> {
            File f = new File(modelsDir(), file);
            File p = new File(modelsDir(), file + ".part");
            boolean a = !f.exists() || f.delete();
            boolean b = !p.exists() || p.delete();
            Diag.log("models", "delete " + file + " -> " + (a && b));
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ engine

    private JSObject enginePreflight() {
        if (!LlamaBridge.loaded)
            return err("The engine library (libcathedrai.so) could not be loaded: " + LlamaBridge.loadError);
        String abi = Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?";
        if (!"arm64-v8a".equals(abi))
            return err("This build only supports 64-bit ARM phones, but this device reports " + abi + ".");
        Cpu c = cpu();
        if (c.known && BuildInfo.ARM_ARCH.contains("dotprod") && !c.dotprod)
            return err("This phone's CPU lacks the 'dotprod' instructions the engine was compiled for (" + BuildInfo.ARM_ARCH
                    + "). Rebuild with the repository variable CATHEDRAI_ARM_ARCH set to armv8-a.");
        return null;
    }

    @PluginMethod
    public void loadModel(final PluginCall call) {
        final String path = call.getString("path");
        final int nCtx = call.getInt("nCtx", 4096);
        final int thr = call.getInt("threads", 0);
        llm.execute(() -> {
            final String op = Diag.begin("load model " + path + " ctx=" + nCtx);
            keepAwake(true);
            try {
                JSObject pre = enginePreflight();
                if (pre != null) { call.resolve(pre); return; }
                File f = path == null ? null : new File(path);
                if (f == null || !f.isFile() || f.length() < 1024) {
                    call.resolve(err("The model file is missing or empty: " + path));
                    return;
                }
                int threads = thr > 0 ? thr : defaultThreads();
                Diag.log("engine", "loading with threads=" + threads + " availMem=" + availMemMb() + "MB");
                String json = LlamaBridge.nLoad(path, nCtx, threads);
                JSObject o = new JSObject(json);
                loadedPath = o.optBoolean("ok", false) ? path : null;
                Diag.log("engine", "load result: " + json);
                call.resolve(o);
            } catch (Throwable t) {
                Diag.log("engine", "load FAILED " + t);
                call.resolve(err(msg(t)));
            } finally {
                keepAwake(false);
                Diag.end(op);
            }
        });
    }

    @PluginMethod
    public void generate(final PluginCall call) {
        JSArray arr = call.getArray("messages");
        if (arr == null || arr.length() == 0) {
            call.resolve(err("Nothing to send to the model."));
            return;
        }
        final int n = arr.length();
        final String[] roles = new String[n];
        final byte[][] contents = new byte[n][];
        try {
            for (int i = 0; i < n; i++) {
                JSONObject o = arr.getJSONObject(i);
                roles[i] = o.optString("role", "user");
                contents[i] = o.optString("content", "").getBytes(StandardCharsets.UTF_8);
            }
        } catch (Throwable t) {
            call.resolve(err("Bad message list: " + msg(t)));
            return;
        }
        final float temp = call.getFloat("temp", 0.7f);
        final float topP = call.getFloat("topP", 0.9f);
        final int topK = call.getInt("topK", 40);
        final float rep = call.getFloat("repeat", 1.1f);
        final int maxTok = call.getInt("maxTokens", 1024);
        final int seed = call.getInt("seed", -1);

        llm.execute(() -> {
            final String op = Diag.begin("generate (" + n + " messages)");
            keepAwake(true);
            try {
                if (!LlamaBridge.loaded) { call.resolve(err("Engine library is not loaded.")); return; }
                LlamaBridge.Callback cb = new LlamaBridge.Callback() {
                    @Override
                    public boolean onToken(byte[] piece) {
                        JSObject o = new JSObject();
                        o.put("t", new String(piece, StandardCharsets.UTF_8));
                        notifyListeners("token", o);
                        return true;
                    }

                    @Override
                    public void onPrefill(int done, int total) {
                        JSObject o = new JSObject();
                        o.put("done", done);
                        o.put("total", total);
                        notifyListeners("prefill", o);
                    }
                };
                String json = LlamaBridge.nGenerate(roles, contents, temp, topP, topK, rep, maxTok, seed, cb);
                call.resolve(new JSObject(json));
            } catch (Throwable t) {
                Diag.log("engine", "generate FAILED " + t);
                call.resolve(err(msg(t)));
            } finally {
                keepAwake(false);
                Diag.end(op);
            }
        });
    }

    @PluginMethod
    public void stopGeneration(PluginCall call) {
        if (LlamaBridge.loaded) LlamaBridge.nStop();
        call.resolve();
    }

    @PluginMethod
    public void unloadModel(final PluginCall call) {
        llm.execute(() -> {
            try {
                if (LlamaBridge.loaded) LlamaBridge.nUnload();
                loadedPath = null;
            } catch (Throwable t) {
                Diag.log("engine", "unload failed " + t);
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------------------ diagnostics

    @PluginMethod
    public void getDiagnostics(final PluginCall call) {
        io.execute(() -> {
            try {
                JSObject o = new JSObject();
                o.put("ok", true);

                JSObject dev = new JSObject();
                dev.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                dev.put("android", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
                dev.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "?");
                dev.put("cores", Runtime.getRuntime().availableProcessors());
                ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                dev.put("ramTotal", mi.totalMem);
                dev.put("ramAvail", mi.availMem);
                dev.put("lowMemory", mi.lowMemory);
                dev.put("memClass", am.getMemoryClass());
                dev.put("largeMemClass", am.getLargeMemoryClass());
                o.put("device", dev);

                Cpu c = cpu();
                JSObject cj = new JSObject();
                cj.put("known", c.known);
                cj.put("dotprod", c.dotprod);
                cj.put("i8mm", c.i8mm);
                cj.put("fp16", c.fp16);
                cj.put("features", c.features);
                o.put("cpu", cj);

                JSObject eng = new JSObject();
                eng.put("loaded", LlamaBridge.loaded);
                eng.put("loadError", LlamaBridge.loadError);
                eng.put("arch", BuildInfo.ARM_ARCH);
                eng.put("llamaTag", BuildInfo.LLAMA_TAG);
                eng.put("appVersion", BuildInfo.APP_VERSION);
                eng.put("modelLoaded", loadedPath != null);
                eng.put("modelPath", loadedPath == null ? "" : loadedPath);
                String sys = "";
                if (LlamaBridge.loaded) {
                    try { sys = LlamaBridge.nSystemInfo(); } catch (Throwable t) { sys = "(failed: " + t + ")"; }
                }
                eng.put("sysinfo", sys);
                o.put("engine", eng);

                JSObject st = new JSObject();
                File md = modelsDir();
                st.put("free", freeBytes());
                st.put("dir", md.getAbsolutePath());
                long used = 0;
                File[] fs = md.listFiles();
                JSArray files = new JSArray();
                if (fs != null) {
                    for (File f : fs) {
                        used += f.length();
                        JSObject fo = new JSObject();
                        fo.put("file", f.getName());
                        fo.put("size", f.length());
                        files.put(fo);
                    }
                }
                st.put("used", used);
                st.put("files", files);
                o.put("storage", st);

                JSArray exits = new JSArray();
                for (String s : Diag.exitReasons(getContext(), 6)) exits.put(s);
                o.put("exits", exits);
                o.put("incidents", Diag.tail("incidents.txt", 12000));
                o.put("appLog", Diag.tail("app.log", 14000));
                o.put("nativeLog", Diag.tail("native.log", 14000));
                call.resolve(o);
            } catch (Throwable t) {
                Diag.log("diag", "getDiagnostics failed " + t);
                call.reject("Could not collect diagnostics: " + msg(t));
            }
        });
    }

    @PluginMethod
    public void clearDiagnostics(PluginCall call) {
        Diag.clear();
        Diag.log("diag", "logs cleared by user");
        call.resolve();
    }

    @PluginMethod
    public void shareText(final PluginCall call) {
        String text = call.getString("text", "");
        if (text.length() > 120000) text = text.substring(0, 120000);
        final String t = text;
        final Activity a = getActivity();
        if (a == null) { call.reject("No activity"); return; }
        a.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, "CathedrAI diagnostics");
                i.putExtra(Intent.EXTRA_TEXT, t);
                a.startActivity(Intent.createChooser(i, "Send report"));
                call.resolve();
            } catch (Throwable e) {
                call.reject("Could not open the share sheet: " + msg(e));
            }
        });
    }
}
