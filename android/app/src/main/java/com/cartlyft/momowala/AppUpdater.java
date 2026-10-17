package com.cartlyft.momowala;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.*;
import android.graphics.Color;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;

/** Explicitly requested downloads; Android always owns installation consent. */
final class AppUpdater {
    static final String ORIGIN="https://momowala-os.vercel.app";
    private final Activity activity;
    private boolean busy;
    private boolean readyPrompted;
    private Dialog gate;
    private String gatedPolicy;
    private Runnable startup;
    private int offeredVersion;
    interface PolicyReader { JSONObject read() throws Exception; }
    private final PolicyReader policyReader;
    void start(Runnable openLogin) {
        startup=openLogin;
        try { showRequired(new JSONObject(activity.getSharedPreferences("update_policy",0).getString("policy","{}"))); } catch(Exception ignored) {}
        check(false);
    }
    private void finishStartup() {
        if(gate!=null || startup==null || activity.isFinishing() || activity.isDestroyed())return;
        Runnable open=startup; startup=null; open.run();
    }
    private void applyPolicy(JSONObject info) throws Exception {
        validateManifest(info);
        activity.getSharedPreferences("update_policy",0).edit().putString("policy",info.toString()).apply();
        showRequired(info);
        finishStartup();
    }
    // Returning from login, notification settings or the installer must not
    // fetch version policy again. Cold startup and the explicit menu own checks.
    void foreground() { readyPrompted=false; }
    private boolean required(JSONObject info) {
        try { return info.optInt("minimumVersionCode",0)>activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionCode; }
        catch(Exception ignored) { return false; }
    }
    private void showRequired(JSONObject info) throws Exception {
        validateManifest(info);
        if(!required(info)) { if(gate!=null)gate.dismiss(); gate=null; return; }
        if(activity.isFinishing())return;
        if(gate!=null && info.toString().equals(gatedPolicy))return;
        if(gate!=null)gate.dismiss();
        gatedPolicy=info.toString();
        gate=new Dialog(activity); gate.setCancelable(false);
        LinearLayout layout=new LinearLayout(activity); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(android.view.Gravity.CENTER); layout.setPadding(32,48,32,48); layout.setBackgroundColor(Color.WHITE);
        TextView title=new TextView(activity); title.setText("Update Cartlyft to continue"); title.setTextSize(26); title.setTextColor(Color.rgb(20,35,50)); layout.addView(title);
        TextView detail=new TextView(activity); detail.setText("Version "+info.optString("versionName")+" is required. Download the update, then approve installation in Android. Your saved orders remain on this phone."); detail.setTextSize(17); detail.setPadding(0,24,0,24); layout.addView(detail);
        Button action=new Button(activity); action.setText("Download / install update");
        action.setOnClickListener(v->{ if(prefs().contains("downloadId"))resume(true); else download(info); }); layout.addView(action);
        Button retry=new Button(activity); retry.setText("Check again"); retry.setOnClickListener(v->check(false)); layout.addView(retry);
        gate.setContentView(layout); gate.show(); gate.getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT);
    }
    AppUpdater(Activity activity) { this.activity=activity;this.policyReader=this::fetchPolicy; }
    AppUpdater(Activity activity,PolicyReader reader) { this.activity=activity;this.policyReader=reader; }
    private JSONObject fetchPolicy() throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/api/app-update").openConnection();
        connection.setConnectTimeout(3000);connection.setReadTimeout(3000);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
        try {
            if(connection.getResponseCode()!=200)throw new IOException("Policy unavailable");
            ByteArrayOutputStream body=new ByteArrayOutputStream();
            try(InputStream input=connection.getInputStream()) {
                byte[] buffer=new byte[2048];int n;
                while((n=input.read(buffer))!=-1) {body.write(buffer,0,n);if(body.size()>16384)throw new IOException("Policy too large");}
            }
            JSONObject info=new JSONObject(body.toString("UTF-8"));validateManifest(info);return info;
        } finally {connection.disconnect();}
    }
    private SharedPreferences prefs() { return activity.getSharedPreferences("app_update",0); }
    private DownloadManager downloads() { return (DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE); }
    private void message(String text) { Toast.makeText(activity,text,Toast.LENGTH_LONG).show(); }
    private void error() { if(!activity.isFinishing()) new AlertDialog.Builder(activity).setTitle("Update unavailable").setMessage("Check your connection and try again from App settings → Check for updates. Your current app and saved data are unchanged.").setPositiveButton("OK",null).show(); }
    void check() { check(true); }
    private void check(boolean explicit) {
        if(busy) { if(explicit)message("Checking your update…"); return; }
        if(explicit && prefs().contains("downloadId")) { resume(true); return; }
        busy=true; if(explicit)message("Checking for updates…");
        new Thread(()->{
            try {
                JSONObject info=policyReader.read();validateManifest(info);
                final JSONObject update=info;
                PackageInfo installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
                boolean newer=info.getInt("versionCode")>installed.versionCode;
                activity.runOnUiThread(()->{busy=false;if(activity.isFinishing()||activity.isDestroyed())return;
                    try { applyPolicy(update); } catch(Exception invalid) {finishStartup();return;}
                    if(required(update))return;
                    if(!newer) { if(explicit)message("You have the latest Cartlyft version."); return; }
                    if(!explicit && offeredVersion==update.optInt("versionCode"))return;
                    offeredVersion=update.optInt("versionCode");
                    new AlertDialog.Builder(activity).setTitle("Update Cartlyft to "+update.optString("versionName"))
                        .setMessage(update.optString("notes")+"\n\nDownload in the background, then approve Install when Android asks. Your sign-in and saved data stay on this phone.")
                        .setPositiveButton("Download update",(d,w)->download(update)).setNegativeButton("Later",null).show();
                });
            } catch(Exception e) { activity.runOnUiThread(()->{busy=false;finishStartup();if(explicit)error();}); }
        },"update-check").start();
    }
    static void validateManifest(JSONObject info) throws Exception {
        String path=info.getString("path");
        int minimum=info.optInt("minimumVersionCode",0);
        if(minimum<0 || minimum>info.getInt("versionCode"))throw new IOException("Invalid required version");
        if(!path.matches("/downloads/cartlyft-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk") || !info.getString("sha256").matches("[a-f0-9]{64}") || info.getInt("versionCode")<=0 || info.getLong("bytes")<=0 || info.getLong("bytes")>100*1024*1024 || !info.getString("versionName").matches("[0-9]+\\.[0-9]+\\.[0-9]+")) throw new IOException("Invalid manifest");
    }
    private void download(JSONObject info) {
        try {
            File folder=new File(activity.getExternalFilesDir(null),"updates");
            if(!folder.exists()&&!folder.mkdirs())throw new IOException("Storage unavailable");
            File file=new File(folder,"cartlyft.apk"); if(file.exists()&&!file.delete())throw new IOException("Old download locked");
            DownloadManager.Request request=new DownloadManager.Request(Uri.parse(ORIGIN+info.getString("path")))
                .setTitle("Cartlyft update").setDescription("Downloading. Return to Cartlyft to install.")
                .setMimeType("application/vnd.android.package-archive").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationUri(Uri.fromFile(file));
            long id=downloads().enqueue(request);
            prefs().edit().putLong("downloadId",id).putString("manifest",info.toString()).apply();
            message("Downloading in the background. Return here when ready to install.");
        } catch(Exception e) { error(); }
    }
    void resume(boolean explicit) {
        if(busy || (!explicit && readyPrompted) || !prefs().contains("downloadId"))return;
        long id=prefs().getLong("downloadId",-1);
        try(Cursor cursor=downloads().query(new DownloadManager.Query().setFilterById(id))) {
            if(cursor==null || !cursor.moveToFirst()) { prefs().edit().clear().apply(); if(explicit)check(); return; }
            int state=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if(state==DownloadManager.STATUS_FAILED) { downloads().remove(id);prefs().edit().clear().apply();error();return; }
            if(state!=DownloadManager.STATUS_SUCCESSFUL) { if(explicit)message("Update is downloading. Check progress in Android notifications.");return; }
            busy=true;
            new Thread(()->{
                try {
                    JSONObject info=new JSONObject(prefs().getString("manifest","{}")); validateManifest(info);
                    File apk=new File(activity.getExternalFilesDir(null),"updates/cartlyft.apk");
                    if(info.getInt("versionCode")<=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionCode) {
                        downloads().remove(id);prefs().edit().clear().apply();activity.runOnUiThread(()->{busy=false;if(explicit)check();});return;
                    }
                    validateApk(activity,apk,info);
                    activity.runOnUiThread(()->{busy=false;if(activity.isFinishing()||activity.isDestroyed()||(!activity.hasWindowFocus() && gate==null))return;
                        readyPrompted=true;
                        new AlertDialog.Builder(activity).setTitle("Update ready")
                          .setMessage("Install Cartlyft "+info.optString("versionName")+" now? Android will ask you to confirm. The app may close during installation; saved data is retained.")
                          .setPositiveButton("Install",(d,w)->install(apk)).setNegativeButton("Later",null).show();
                    });
                } catch(Exception e) { downloads().remove(id); prefs().edit().clear().apply();activity.runOnUiThread(()->{busy=false;error();}); }
            },"update-verify").start();
        } catch(Exception e) { busy=false;error(); }
    }
    @SuppressWarnings("deprecation")
    static void validateApk(Context context,File apk,JSONObject info) throws Exception {
        if(apk.length()!=info.getLong("bytes"))throw new IOException("Wrong size");
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(apk)) { byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1)digest.update(buffer,0,n); }
        StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(Locale.US,"%02x",b&255));
        if(!hash.toString().equals(info.getString("sha256")))throw new IOException("Checksum mismatch");
        PackageManager pm=context.getPackageManager();
        PackageInfo target=pm.getPackageArchiveInfo(apk.getAbsolutePath(),PackageManager.GET_SIGNATURES);
        PackageInfo current=pm.getPackageInfo(context.getPackageName(),PackageManager.GET_SIGNATURES);
        if(target==null || !context.getPackageName().equals(target.packageName) || target.versionCode!=info.getInt("versionCode") || target.versionCode<=current.versionCode || !info.getString("versionName").equals(target.versionName) || target.signatures==null || !Arrays.equals(target.signatures,current.signatures))throw new IOException("Untrusted update");
    }
    private void install(File apk) {
        try {
            if(Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                new AlertDialog.Builder(activity).setTitle("Allow Cartlyft updates")
                  .setMessage("Enable ‘Allow from this source’ for Cartlyft, then return here to install the verified update.")
                  .setPositiveButton("Open settings",(d,w)->activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName()))))
                  .setNegativeButton("Later",null).show(); return;
            }
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",apk);
            activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch(Exception e) { error(); }
    }
}
