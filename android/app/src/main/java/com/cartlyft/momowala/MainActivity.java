package com.cartlyft.momowala;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.print.PrintManager;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.*;

/** Signed Android shell. Only the bundled application runs inside this WebView. */
public class MainActivity extends Activity {
    private static final String HOST = "momowala-os.vercel.app";
    private static final String ORIGIN = "https://" + HOST;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final List<WebView> popups = new ArrayList<>();
    private ProgressBar progress;
    private TextView failure;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        // Android 15 enforces edge-to-edge. Keep controls clear of system bars/IME.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        bar.setPadding(16, 0, 8, 0);
        bar.setBackgroundColor(Color.rgb(10,47,92));
        TextView title = new TextView(this);
        title.setText("Cartlyft · Momo Wala"); title.setTextColor(Color.WHITE); title.setTextSize(16);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button more = new Button(this); more.setText("⋮"); more.setContentDescription("App options");
        more.setTextColor(Color.WHITE); more.setBackgroundColor(Color.TRANSPARENT);
        bar.addView(more, new LinearLayout.LayoutParams(dp(48), dp(44)));
        more.setOnClickListener(v -> showMenu(more));
        root.addView(bar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        failure = new TextView(this); failure.setPadding(24,24,24,24); failure.setVisibility(View.GONE);
        root.addView(failure);
        try {
            web = createWebView();
            root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
            setContentView(root);
            String agent = web.getSettings().getUserAgentString();
            java.util.regex.Matcher version = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(agent);
            if (version.find() && Integer.parseInt(version.group(1)) < 51) {
                showFailure("Update Android System WebView or Chrome from the Play Store, then reopen Cartlyft.");
            } else web.loadUrl(ORIGIN + "/login");
        } catch (RuntimeException e) {
            setContentView(root);
            showFailure("Android System WebView is unavailable. Enable or update it in Settings / Play Store, then reopen Cartlyft.");
        }
    }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private void showFailure(String text) { failure.setText(text); failure.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
    private WebView createWebView() {
        WebView view = new WebView(this);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true); s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " CartlyftAndroid/1.0.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost()) || !"GET".equals(request.getMethod())) return null;
                String path = u.getPath();
                if (path == null || path.startsWith("/api/") || path.startsWith("/downloads/")) return null;
                if (path.contains("..") || path.contains("\\") || path.indexOf('\0') >= 0) return emptyResponse();
                String file = path.substring(1);
                if (path.equals("/") || path.equals("/login") || path.equals("/work") || path.equals("/manage") || path.equals("/admin") || path.equals("/admin/login") || path.startsWith("/c/")) file = "index.html";
                try {
                    InputStream input = getAssets().open("web/" + file);
                    String ext = MimeTypeMap.getFileExtensionFromUrl(file);
                    String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                    if (file.endsWith(".js")) mime = "application/javascript";
                    if (mime == null) mime = "application/octet-stream";
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), input);
                } catch (IOException e) { return emptyResponse(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return navigate(v, r.getUrl(), r.isForMainFrame()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) { return navigate(v, Uri.parse(url), true); }
            @Override public void onPageFinished(WebView v, String url) {
                progress.setVisibility(View.GONE);
                if (url.startsWith(ORIGIN) || url.equals("about:blank"))
                    v.evaluateJavascript("window.print=function(){location.href='cartlyft-print://print';}", null);
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) showFailure("Could not open the app. Use App options → Reload. Your saved changes remain on this phone.");
            }
            // Never bypass certificate errors: WebView's default handler cancels.
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int n) { if (v == web) { progress.setProgress(n); progress.setVisibility(n == 100 ? View.GONE : View.VISIBLE); } }
            @Override public boolean onJsAlert(WebView v, String url, String msg, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setPositiveButton("OK", (d,w) -> result.confirm()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String msg, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setPositiveButton("OK", (d,w) -> result.confirm()).setNegativeButton("Cancel", (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsPrompt(WebView v, String url, String msg, String initial, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this); input.setText(initial);
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setView(input).setPositiveButton("OK", (d,w) -> result.confirm(input.getText().toString())).setNegativeButton("Cancel", (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), 100); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback=null; Toast.makeText(MainActivity.this,"Install a file picker to select an image.",Toast.LENGTH_LONG).show(); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message result) {
                if (!gesture) return false;
                WebView popup = createWebView(); popups.add(popup);
                android.app.Dialog window = new android.app.Dialog(MainActivity.this);
                window.setContentView(popup); window.show();
                window.getWindow().setLayout(-1,-1);
                window.setOnDismissListener(d -> { popups.remove(popup); popup.destroy(); });
                ((WebView.WebViewTransport) result.obj).setWebView(popup); result.sendToTarget(); return true;
            }
        });
        view.setDownloadListener((url, ua, disposition, mime, length) -> external(Uri.parse(url)));
        return view;
    }
    private WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    private boolean navigate(WebView view, Uri u, boolean mainFrame) {
        if ("cartlyft-print".equals(u.getScheme())) {
            if (mainFrame) ((PrintManager)getSystemService(PRINT_SERVICE)).print("Cartlyft", view.createPrintDocumentAdapter("Cartlyft"), null);
            return true;
        }
        if ("about".equals(u.getScheme()) && "about:blank".equals(u.toString())) return false;
        if ("https".equals(u.getScheme()) && HOST.equals(u.getHost()) && !u.getPath().startsWith("/downloads/") && !u.getPath().equals("/install.html")) return false;
        if (mainFrame) external(u);
        return true;
    }
    private void external(Uri uri) {
        String scheme = uri.getScheme();
        if (!Arrays.asList("https","http","tel","mailto","upi","whatsapp").contains(scheme)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException e) { Toast.makeText(this,"No app is installed to open this link.",Toast.LENGTH_LONG).show(); }
    }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        for (String item : new String[]{"Reload", "Print screen", "Open website", "Download updates", "About / notifications"}) menu.getMenu().add(item);
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getTitle().toString()) {
                case "Reload": if (web != null) { failure.setVisibility(View.GONE); web.reload(); } break;
                case "Print screen": if (web != null) ((PrintManager)getSystemService(PRINT_SERVICE)).print("Cartlyft",web.createPrintDocumentAdapter("Cartlyft"),null); break;
                case "Open website": external(Uri.parse(ORIGIN+"/login")); break;
                case "Download updates": external(Uri.parse(ORIGIN+"/install.html")); break;
                default: new AlertDialog.Builder(this).setTitle("Cartlyft 1.0.0").setMessage("For Android 7 and newer.\n\nKeep the app open for order alerts. Background push notifications are not available in this APK.\n\nSaved staff changes sync when internet returns. Sign in online before working offline. Do not clear app storage with unsynced changes.\n\nInstall future updates over this app to keep your saved data.").setPositiveButton("OK",null).show();
            } return true;
        }); menu.show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request==100 && fileCallback!=null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data)); fileCallback=null; }
    }
    @Override public void onBackPressed() { if (web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if(fileCallback!=null) fileCallback.onReceiveValue(null); if(web!=null) web.destroy(); for(WebView p:popups) p.destroy(); super.onDestroy(); }
}
