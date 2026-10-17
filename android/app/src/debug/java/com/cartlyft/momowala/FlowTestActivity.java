package com.cartlyft.momowala;

/** Blank, debug-only host. Instrumentation supplies isolated assets and blocks networking. */
public class FlowTestActivity extends android.app.Activity {
    android.webkit.WebView web;
    @Override public void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        web = new android.webkit.WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        setContentView(web);
    }
    @Override public void onDestroy() { web.destroy(); super.onDestroy(); }
}
