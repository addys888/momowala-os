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
            check("ru.a402d.rawbtprinter".equals(activity.sent.getPackage()), "Receipt handler must be RawBT");
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
            testReminders();
            testUpdates();
            testPartnerIcon();
            result.putString("stream", "PASS: update manifest and tampered APK rejection; real scheduled notification, completion cancellation, logout-independent assignment;  RawBT intent, byte preservation, subframe guard, blocked schemes, HTTPS routing\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + error.toString() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private void testReminders() throws Exception {
        android.content.Context context=getTargetContext();
        InventoryReminders.clear(context);
        try {
            java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("HH:mm",java.util.Locale.US);
            format.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
            String time=format.format(new java.util.Date(System.currentTimeMillis()+30*60_000L));
            org.json.JSONObject config=new org.json.JSONObject().put("cartId","local-test-only").put("openTime",time).put("expiresAt",System.currentTimeMillis()+3600_000L);
            InventoryReminders.configure(context,config);
            InventoryReminders.prefs(context).edit().putBoolean("enabled",true).commit();
            InventoryReminders.schedule(context,false);
            Thread.sleep(3500);
            check(InventoryReminders.manager(context).getActiveNotifications().length>0,"Scheduled alarm did not post notification");
            config.put("completedDate",OpeningSchedule.date(OpeningSchedule.businessOpening(time,System.currentTimeMillis())));
            InventoryReminders.configure(context,config);
            check(InventoryReminders.manager(context).getActiveNotifications().length==0,"Saved inventory did not cancel notification");
            InventoryReminders.prefs(context).edit().putLong("expiresAt",0).commit();
            InventoryReminders.fire(context);
            check(InventoryReminders.prefs(context).getBoolean("enabled",false),"Session expiry incorrectly removed device assignment");
            check(!InventoryReminders.prefs(context).contains("token"),"Device assignment retained login token");
            try {
                InventoryReminders.configure(context,new org.json.JSONObject(config.toString()).put("cartId","different-cart"));
                throw new AssertionError("Assignment changed without unassigning");
            } catch(IllegalArgumentException expected) { }
            check("local-test-only".equals(InventoryReminders.prefs(context).getString("cartId","")),"Existing assignment was lost");
            InventoryReminders.clear(context);
            check(!InventoryReminders.prefs(context).getBoolean("enabled",false),"Explicit unassign failed");
        } finally { InventoryReminders.clear(context); }
    }
    private void testUpdates() throws Exception {
        org.json.JSONObject info=new org.json.JSONObject().put("versionCode",5).put("versionName","1.3.0").put("path","/downloads/cartlyft-1.3.0.apk").put("bytes",12).put("sha256",new String(new char[64]).replace('\0','a'));
        AppUpdater.validateManifest(info);
        for(String path:new String[]{"https://evil.example/update.apk","/downloads/../private.apk","/downloads/cartlyft-1.3.0.apk?redirect=evil"}) {
            try { AppUpdater.validateManifest(new org.json.JSONObject(info.toString()).put("path",path));throw new AssertionError("Unsafe update path accepted"); } catch(java.io.IOException expected) { }
        }
        java.io.File file=new java.io.File(getTargetContext().getCacheDir(),"tampered-update.apk");
        try {
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)) { out.write(new byte[12]); }
            try { AppUpdater.validateApk(getTargetContext(),file,info);throw new AssertionError("Tampered update accepted"); } catch(java.io.IOException expected) { }
            java.io.File folder=new java.io.File(getTargetContext().getExternalFilesDir(null),"updates");folder.mkdirs();
            Uri uri=androidx.core.content.FileProvider.getUriForFile(getTargetContext(),getTargetContext().getPackageName()+".updates",new java.io.File(folder,"cartlyft.apk"));
            check("content".equals(uri.getScheme()),"Installer must receive a content URI");
            try {
                androidx.core.content.FileProvider.getUriForFile(getTargetContext(),getTargetContext().getPackageName()+".updates",file);
                throw new AssertionError("Update provider exposed unrelated private files");
            } catch(IllegalArgumentException expected) { }
        } finally { file.delete(); }
    }
    private void testPartnerIcon() throws Exception {
        android.graphics.drawable.Drawable icon=getTargetContext().getPackageManager().getApplicationIcon(getTargetContext().getPackageName());
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(216,216,android.graphics.Bitmap.Config.ARGB_8888);
        icon.setBounds(0,0,216,216);icon.draw(new android.graphics.Canvas(bitmap));
        check(bitmap.getPixel(4,4)==android.graphics.Color.rgb(217,35,68),"Partner icon background must be red");
        java.io.File output=new java.io.File(getTargetContext().getExternalFilesDir(null),"partner-icon.png");
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream(output)){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}
        check("Cartlyft Partner".contentEquals(getTargetContext().getApplicationInfo().loadLabel(getTargetContext().getPackageManager())),"Partner app label changed unexpectedly");
    }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
