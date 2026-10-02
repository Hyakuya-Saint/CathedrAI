package com.cathedrai.app;

import com.getcapacitor.JSObject;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Reads just the header + metadata of a GGUF file (never the tensors), so an import can be
 * validated and described without loading the model.
 */
final class GgufInfo {
    int version;
    long tensors, kvs;
    String arch = "", name = "", sizeLabel = "";
    int fileType = -1;
    long ctxTrain, layers, embd;
    boolean hasTemplate;

    String quant() {
        switch (fileType) {
            case 0: return "F32";
            case 1: return "F16";
            case 2: return "Q4_0";
            case 3: return "Q4_1";
            case 7: return "Q8_0";
            case 8: return "Q5_0";
            case 9: return "Q5_1";
            case 10: return "Q2_K";
            case 11: return "Q3_K_S";
            case 12: return "Q3_K_M";
            case 13: return "Q3_K_L";
            case 14: return "Q4_K_S";
            case 15: return "Q4_K_M";
            case 16: return "Q5_K_S";
            case 17: return "Q5_K_M";
            case 18: return "Q6_K";
            case 19: return "IQ2_XXS";
            case 20: return "IQ2_XS";
            case 21: return "Q2_K_S";
            case 22: return "IQ3_XS";
            case 23: return "IQ3_XXS";
            case 24: return "IQ1_S";
            case 25: return "IQ4_NL";
            case 26: return "IQ3_S";
            case 27: return "IQ3_M";
            case 28: return "IQ2_S";
            case 29: return "IQ2_M";
            case 30: return "IQ4_XS";
            case 31: return "IQ1_M";
            case 32: return "BF16";
            default: return "";
        }
    }

    JSObject toJson() {
        JSObject o = new JSObject();
        o.put("version", version);
        o.put("arch", arch);
        o.put("name", name);
        o.put("sizeLabel", sizeLabel);
        o.put("quant", quant());
        o.put("ctx", ctxTrain);
        o.put("layers", layers);
        o.put("embd", embd);
        o.put("tensors", tensors);
        o.put("template", hasTemplate);
        return o;
    }

    // ------------------------------------------------------------------ reader

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x ", x));
        return sb.toString().trim();
    }

    static void checkMagic(byte[] head, String fileName) throws IOException {
        if (head.length < 8 || head[0] != 'G' || head[1] != 'G' || head[2] != 'U' || head[3] != 'F') {
            byte[] first = new byte[Math.min(8, head.length)];
            System.arraycopy(head, 0, first, 0, first.length);
            throw new IOException("This is not a GGUF model file (first bytes: " + hex(first)
                    + "). Pick a .gguf file, not a .bin, .safetensors or .zip.");
        }
        int ver = (head[4] & 0xff) | ((head[5] & 0xff) << 8) | ((head[6] & 0xff) << 16) | ((head[7] & 0xff) << 24);
        if (ver < 2 || ver > 3) throw new IOException("Unsupported GGUF version " + ver);
        if (fileName != null && fileName.toLowerCase().matches(".*-0*\\d+-of-0*\\d+\\.gguf")) {
            throw new IOException("This looks like one part of a split model (…-00001-of-0000N.gguf). "
                    + "Split models are not supported yet: please use a single-file GGUF.");
        }
    }

    static GgufInfo read(File f) throws IOException {
        try (BufferedInputStream in = new BufferedInputStream(new FileInputStream(f), 1 << 16)) {
            R r = new R(in);
            byte[] head = r.bytes(8);
            checkMagic(head, null);
            GgufInfo g = new GgufInfo();
            g.version = (head[4] & 0xff) | ((head[5] & 0xff) << 8) | ((head[6] & 0xff) << 16) | ((head[7] & 0xff) << 24);
            g.tensors = r.u64();
            g.kvs = r.u64();
            if (g.kvs < 0 || g.kvs > 200000 || g.tensors < 0 || g.tensors > 2000000)
                throw new IOException("GGUF header looks corrupt (tensors=" + g.tensors + ", metadata=" + g.kvs + ")");
            for (long i = 0; i < g.kvs; i++) {
                long klen = r.u64();
                if (klen < 0 || klen > 4096) throw new IOException("GGUF metadata key is corrupt");
                String key = new String(r.bytes((int) klen), StandardCharsets.UTF_8);
                int t = (int) r.u32();
                if (key.equals("general.architecture") && t == 8) g.arch = r.str(256);
                else if (key.equals("general.name") && t == 8) g.name = r.str(256);
                else if (key.equals("general.size_label") && t == 8) g.sizeLabel = r.str(64);
                else if (key.equals("tokenizer.chat_template") && t == 8) { g.hasTemplate = true; r.skip(r.u64()); }
                else if (key.equals("general.file_type") && isInt(t)) g.fileType = (int) r.intOf(t);
                else if (key.endsWith(".context_length") && isInt(t)) { long v = r.intOf(t); if (g.ctxTrain == 0) g.ctxTrain = v; }
                else if (key.endsWith(".block_count") && isInt(t)) { long v = r.intOf(t); if (g.layers == 0) g.layers = v; }
                else if (key.endsWith(".embedding_length") && isInt(t)) { long v = r.intOf(t); if (g.embd == 0) g.embd = v; }
                else r.skipValue(t);
            }
            if (g.arch.isEmpty()) throw new IOException("GGUF metadata has no architecture: the file may be damaged");
            return g;
        }
    }

    private static boolean isInt(int t) {
        return t == 0 || t == 1 || t == 2 || t == 3 || t == 4 || t == 5 || t == 10 || t == 11;
    }

    /** Little-endian primitive reader over a stream. */
    private static final class R {
        private final BufferedInputStream in;

        R(BufferedInputStream in) { this.in = in; }

        byte[] bytes(int n) throws IOException {
            byte[] b = new byte[n];
            int off = 0;
            while (off < n) {
                int r = in.read(b, off, n - off);
                if (r < 0) throw new EOFException("File ended inside the GGUF header (truncated file?)");
                off += r;
            }
            return b;
        }

        long u32() throws IOException {
            byte[] b = bytes(4);
            return (b[0] & 0xffL) | ((b[1] & 0xffL) << 8) | ((b[2] & 0xffL) << 16) | ((b[3] & 0xffL) << 24);
        }

        long u64() throws IOException {
            byte[] b = bytes(8);
            long v = 0;
            for (int i = 7; i >= 0; i--) v = (v << 8) | (b[i] & 0xffL);
            return v;
        }

        long intOf(int t) throws IOException {
            switch (t) {
                case 0: return bytes(1)[0] & 0xffL;
                case 1: return bytes(1)[0];
                case 2: { byte[] b = bytes(2); return (b[0] & 0xffL) | ((b[1] & 0xffL) << 8); }
                case 3: { byte[] b = bytes(2); return (short) ((b[0] & 0xff) | ((b[1] & 0xff) << 8)); }
                case 4: return u32();
                case 5: return (int) u32();
                case 10: case 11: return u64();
                default: throw new IOException("not an integer type: " + t);
            }
        }

        String str(int max) throws IOException {
            long len = u64();
            if (len < 0 || len > (1L << 28)) throw new IOException("GGUF string length is corrupt");
            int keep = (int) Math.min(len, max);
            String s = new String(bytes(keep), StandardCharsets.UTF_8);
            skip(len - keep);
            return s;
        }

        void skip(long n) throws IOException {
            if (n < 0) throw new IOException("negative skip: file is corrupt");
            while (n > 0) {
                long s = in.skip(n);
                if (s <= 0) {
                    if (in.read() < 0) throw new EOFException("File ended inside the GGUF header (truncated file?)");
                    s = 1;
                }
                n -= s;
            }
        }

        private static int fixed(int t) {
            switch (t) {
                case 0: case 1: case 7: return 1;
                case 2: case 3: return 2;
                case 4: case 5: case 6: return 4;
                case 10: case 11: case 12: return 8;
                default: return 0;
            }
        }

        void skipValue(int t) throws IOException {
            int sz = fixed(t);
            if (sz > 0) { skip(sz); return; }
            if (t == 8) { skip(u64()); return; }
            if (t == 9) {
                int et = (int) u32();
                long n = u64();
                if (n < 0) throw new IOException("GGUF array length is corrupt");
                int es = fixed(et);
                if (es > 0) { skip(n * es); return; }
                for (long i = 0; i < n; i++) skipValue(et);
                return;
            }
            throw new IOException("Unknown GGUF value type " + t);
        }
    }
}
