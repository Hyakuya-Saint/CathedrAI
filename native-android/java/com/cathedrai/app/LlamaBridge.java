package com.cathedrai.app;

/** JNI surface of libcathedrai.so. If the library cannot load, the app still runs (diagnostics explain why). */
final class LlamaBridge {
    static volatile boolean loaded = false;
    static volatile String loadError = "";

    static {
        try {
            System.loadLibrary("cathedrai");
            loaded = true;
        } catch (Throwable t) {
            loadError = t.toString();
        }
    }

    private LlamaBridge() {}

    interface Callback {
        /** One decoded piece of text (UTF-8 bytes). */
        boolean onToken(byte[] piece);

        /** Prompt processing progress, in tokens. */
        void onPrefill(int done, int total);
    }

    static native boolean nInit(String logPath);

    static native String nSystemInfo();

    /** Returns a JSON object: {"ok":true,...} or {"ok":false,"error":"..."}. */
    static native String nLoad(String path, int nCtx, int nThreads, String projPath);

    static native boolean nVisionCompiled();

    /** Returns a JSON object with statistics, or {"ok":false,"error":"..."}. Blocks until finished. */
    static native String nGenerate(String[] roles, byte[][] contents, float temp, float topP, int topK,
                                   float repeatPenalty, int maxNew, int seed,
                                   byte[][] imgs, int[] imgW, int[] imgH, Callback cb);

    static native void nStop();

    static native void nUnload();
}
