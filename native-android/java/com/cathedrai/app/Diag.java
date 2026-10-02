package com.cathedrai.app;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.RandomAccessFile;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Everything the diagnostics screen shows comes from here.
 *
 *  app.log        – lines written by Java and by the web UI (flushed on every write)
 *  native.log     – lines written by the C++ engine and llama.cpp itself
 *  incidents.txt  – things that went wrong: Java crashes, and "the app died while doing X"
 *  inflight_*.txt – a marker created when a risky operation starts and deleted when it
 *                   ends normally. If one is still there at the next launch, the process
 *                   was killed in the middle of that operation.
 */
final class Diag {
    private static File dir;
    private static final Object LOCK = new Object();
    private static final SimpleDateFormat TS = new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US);

    private Diag() {}

    static void init(Context c) {
        synchronized (LOCK) {
            if (dir != null) return;
            dir = new File(c.getFilesDir(), "diag");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        rotate("app.log", 400000);
        rotate("native.log", 400000);
        rotate("incidents.txt", 200000);

        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                incident("JAVA CRASH in thread '" + t.getName() + "':\n" + sw);
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        });
        log("diag", "process start pid=" + android.os.Process.myPid() + " sdk=" + Build.VERSION.SDK_INT
                + " device=" + Build.MANUFACTURER + " " + Build.MODEL);
    }

    static String path(String name) {
        return dir == null ? "" : new File(dir, name).getAbsolutePath();
    }

    private static String stamp() {
        synchronized (LOCK) {
            return TS.format(new Date());
        }
    }

    private static void append(String name, String text) {
        if (dir == null) return;
        synchronized (LOCK) {
            try (FileOutputStream out = new FileOutputStream(new File(dir, name), true)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            } catch (Throwable ignored) { }
        }
    }

    private static void rotate(String name, long max) {
        File f = new File(dir, name);
        if (f.exists() && f.length() > max) {
            File old = new File(dir, name + ".old");
            //noinspection ResultOfMethodCallIgnored
            old.delete();
            //noinspection ResultOfMethodCallIgnored
            f.renameTo(old);
        }
    }

    static void log(String tag, String msg) {
        append("app.log", stamp() + " [" + tag + "] " + msg + "\n");
    }

    static void incident(String text) {
        append("incidents.txt", "==== " + stamp() + " ====\n" + text + "\n\n");
    }

    /** Mark a risky operation as started. Returns an id for end(). */
    static String begin(String op) {
        String id = Long.toHexString(System.nanoTime());
        if (dir != null) {
            synchronized (LOCK) {
                try (FileOutputStream out = new FileOutputStream(new File(dir, "inflight_" + id + ".txt"))) {
                    out.write((stamp() + "  " + op).getBytes(StandardCharsets.UTF_8));
                } catch (Throwable ignored) { }
            }
        }
        log("op", "BEGIN " + op);
        return id;
    }

    static void end(String id) {
        if (id == null || dir == null) return;
        //noinspection ResultOfMethodCallIgnored
        new File(dir, "inflight_" + id + ".txt").delete();
        log("op", "END " + id);
    }

    /** At startup: operations that never finished (the process died during them). */
    static String takeInflight() {
        if (dir == null) return null;
        File[] fs = dir.listFiles();
        if (fs == null) return null;
        StringBuilder sb = new StringBuilder();
        for (File f : fs) {
            if (f.getName().startsWith("inflight_")) {
                sb.append(readAll(f, 4000).trim()).append('\n');
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
        return sb.length() == 0 ? null : sb.toString().trim();
    }

    private static String readAll(File f, int max) {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int r;
            while ((r = in.read(b)) > 0 && bo.size() < max) bo.write(b, 0, r);
            return bo.toString("UTF-8");
        } catch (Throwable t) {
            return "";
        }
    }

    /** Last maxBytes of a log file (starting on a line boundary). */
    static String tail(String name, int maxBytes) {
        if (dir == null) return "";
        File f = new File(dir, name);
        if (!f.exists()) return "";
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long len = raf.length();
            long start = Math.max(0, len - maxBytes);
            raf.seek(start);
            byte[] b = new byte[(int) (len - start)];
            raf.readFully(b);
            String s = new String(b, StandardCharsets.UTF_8);
            if (start > 0) {
                int nl = s.indexOf('\n');
                if (nl >= 0) s = s.substring(nl + 1);
            }
            return s;
        } catch (Throwable t) {
            return "(could not read " + name + ": " + t + ")";
        }
    }

    static void clear() {
        if (dir == null) return;
        synchronized (LOCK) {
            for (String n : new String[]{"app.log", "native.log"}) {
                // truncate in place: the C++ side keeps its handle open in append mode
                try (RandomAccessFile raf = new RandomAccessFile(new File(dir, n), "rw")) {
                    raf.setLength(0);
                } catch (Throwable ignored) { }
            }
            //noinspection ResultOfMethodCallIgnored
            new File(dir, "incidents.txt").delete();
            //noinspection ResultOfMethodCallIgnored
            new File(dir, "app.log.old").delete();
            //noinspection ResultOfMethodCallIgnored
            new File(dir, "native.log.old").delete();
        }
    }

    // ----------------------------------------------------------- why did the last process die?

    static List<String> exitReasons(Context c, int max) {
        List<String> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT < 30) {
            out.add("(the OS only reports why the app was closed on Android 11 and newer)");
            return out;
        }
        try {
            out.addAll(ExitApi.read(c, max));
        } catch (Throwable t) {
            out.add("(could not read exit reasons: " + t + ")");
        }
        return out;
    }

    private static final class ExitApi {
        static List<String> read(Context c, int max) {
            List<String> out = new ArrayList<>();
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            List<ApplicationExitInfo> l = am.getHistoricalProcessExitReasons(null, 0, max);
            SimpleDateFormat f = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US);
            for (ApplicationExitInfo e : l) {
                String d = e.getDescription() == null ? "" : e.getDescription();
                out.add(f.format(new Date(e.getTimestamp())) + " | " + reasonName(e.getReason())
                        + " | status " + e.getStatus() + " | rss " + (e.getRss() / 1024) + " MB"
                        + (d.isEmpty() ? "" : " | " + d));
            }
            if (out.isEmpty()) out.add("(no earlier exits recorded)");
            return out;
        }

        static String reasonName(int r) {
            switch (r) {
                case 0: return "UNKNOWN";
                case 1: return "EXIT_SELF (app quit itself)";
                case 2: return "SIGNALED (killed by a signal)";
                case 3: return "LOW_MEMORY (killed to free RAM)";
                case 4: return "CRASH (Java exception)";
                case 5: return "CRASH_NATIVE (native code crashed)";
                case 6: return "ANR (app stopped responding)";
                case 7: return "INITIALIZATION_FAILURE";
                case 8: return "PERMISSION_CHANGE";
                case 9: return "EXCESSIVE_RESOURCE_USAGE";
                case 10: return "USER_REQUESTED";
                case 11: return "USER_STOPPED";
                case 12: return "DEPENDENCY_DIED";
                case 13: return "OTHER";
                case 14: return "FREEZER";
                case 15: return "PACKAGE_STATE_CHANGE";
                case 16: return "PACKAGE_UPDATED";
                default: return "reason " + r;
            }
        }
    }
}
