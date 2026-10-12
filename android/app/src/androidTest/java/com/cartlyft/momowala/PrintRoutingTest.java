package com.cartlyft.momowala;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import java.lang.reflect.Method;

/** Device-side dry run: capture outgoing intents without sending paper to a printer. */
public class PrintRoutingTest extends Instrumentation {
    public static class CaptureActivity extends MainActivity {
        Intent sent;
        @Override public void startActivity(Intent intent) { sent = intent; }
    }
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        android.os.Looper.prepare();
        Bundle result = new Bundle();
        try {
            Method navigate = MainActivity.class.getDeclaredMethod("navigate", WebView.class, Uri.class, boolean.class);
            navigate.setAccessible(true);
            CaptureActivity activity = new CaptureActivity();
            // ESC @, text, newline, GS V: include real control bytes and base64 padding.
            String uri = "rawbt:base64,G0BURVNUCh1WAA==";
            boolean handled = (Boolean) navigate.invoke(activity, null, Uri.parse(uri), true);
            check(handled && activity.sent != null, "RawBT handoff was swallowed");
            check(Intent.ACTION_VIEW.equals(activity.sent.getAction()), "Wrong action");
            check(uri.equals(activity.sent.getDataString()), "Receipt bytes changed");
            check(activity.sent.hasCategory(Intent.CATEGORY_BROWSABLE), "Missing browsable category");
            activity.sent = null;
            navigate.invoke(activity, null, Uri.parse(uri), false);
            check(activity.sent == null, "Subframe launched a print");
            for (String blocked : new String[]{"file:///private/data", "javascript:alert(1)", "intent://arbitrary"}) {
                navigate.invoke(activity, null, Uri.parse(blocked), true);
                check(activity.sent == null, "Unsafe scheme opened: " + blocked);
            }
            navigate.invoke(activity, null, Uri.parse("https://example.com"), true);
            check(activity.sent != null, "Normal external links regressed");
            result.putString("stream", "PASS: RawBT intent, byte preservation, subframe guard, blocked schemes, HTTPS routing\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + error.toString() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
