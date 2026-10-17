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
    private boolean liveFcm,waitFcm;
    @Override public void onCreate(Bundle args) { liveFcm=args!=null && "true".equals(args.getString("liveFcm")); waitFcm=args!=null && "true".equals(args.getString("waitFcm")); super.onCreate(args); start(); }
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
            PartnerAlerts.manager(getTargetContext()).cancelAll();
            AlertPlaybackService.pending(getTargetContext()).edit().clear().commit();
            Thread.sleep(300);
            testReminders();
            testPartnerAlerts();
            testUpdates();
            testRequiredUpdateGate();
            testStartupBeforeLogin();
            testPartnerIcon();
            if(liveFcm) {
                org.json.JSONObject status=PartnerMessagingService.status(getTargetContext());
                check(status.getBoolean("configured"),"Firebase config missing");
                long deadline=android.os.SystemClock.elapsedRealtime()+45000;
                while(getTargetContext().getSharedPreferences("fcm",0).getString("token","").isEmpty() && android.os.SystemClock.elapsedRealtime()<deadline)Thread.sleep(500);
                check(!getTargetContext().getSharedPreferences("fcm",0).getString("token","").isEmpty(),"FCM token unavailable");
                PartnerAlerts.bind(getTargetContext(),new org.json.JSONObject().put("binding","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
                if(waitFcm) {
                    Bundle ready=new Bundle();ready.putString("stream","FCM test device ready\n");sendStatus(0,ready);
                    deadline=android.os.SystemClock.elapsedRealtime()+45000;
                    android.service.notification.StatusBarNotification received=null;
                    while(received==null && android.os.SystemClock.elapsedRealtime()<deadline) {
                        for(android.service.notification.StatusBarNotification n:PartnerAlerts.manager(getTargetContext()).getActiveNotifications())if("partner:live-firebase-verification".equals(n.getTag()))received=n;
                        if(received==null)Thread.sleep(500);
                    }
                    check(received!=null,"Live FCM message did not reach device");
                    received.getNotification().actions[0].actionIntent.send();
                    Thread.sleep(500);
                    check(PartnerAlerts.prefs(getTargetContext()).contains("ack:live-firebase-verification"),"Live FCM alert did not acknowledge");
                    Bundle confirmed=new Bundle();confirmed.putString("stream","Live FCM received and acknowledged\n");sendStatus(0,confirmed);
                }
            }
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
            // Delivery is asynchronous; allow emulator scheduling latency.
            long deadline=android.os.SystemClock.elapsedRealtime()+15000;
            while(alertCount(context)==0 && android.os.SystemClock.elapsedRealtime()<deadline) Thread.sleep(250);
            check(alertCount(context)>0,"Scheduled alarm did not post notification");
            InventoryReminders.acknowledge(context);
            check(!InventoryReminders.prefs(context).contains("completedDate"),"Acknowledgment incorrectly completed stock");
            InventoryReminders.fire(context);
            check(alertCount(context)==0,"Acknowledged opening reminder rang again");
            config.put("completedDate",OpeningSchedule.date(OpeningSchedule.businessOpening(time,System.currentTimeMillis())));
            InventoryReminders.configure(context,config);
            check(alertCount(context)==0,"Saved inventory did not cancel notification");
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
    private int alertCount(android.content.Context context) {
        int count=0;for(android.service.notification.StatusBarNotification n:InventoryReminders.manager(context).getActiveNotifications())if(n.getId()!=4202)count++;
        return count;
    }
    private void testPartnerAlerts() throws Exception {
        android.content.Context c=getTargetContext();
        String binding=java.util.UUID.randomUUID().toString(),key="test-event-42";
        PartnerAlerts.bind(c,new org.json.JSONObject().put("binding",binding));
        PartnerAlerts.show(c,binding,key,"Test opening alert","Manager has not loaded stock");
        android.service.notification.StatusBarNotification posted=null;
        long postDeadline=android.os.SystemClock.elapsedRealtime()+4000;
        while(posted==null && android.os.SystemClock.elapsedRealtime()<postDeadline) {
            for(android.service.notification.StatusBarNotification n:PartnerAlerts.manager(c).getActiveNotifications())if(("partner:"+key).equals(n.getTag()))posted=n;
            if(posted==null)Thread.sleep(50);
        }
        check(posted!=null,"Native partner alert missing");
        check(AlertPlaybackService.pending(c).contains("partner:"+key),"Alert was not registered for persistent playback");
        android.media.MediaPlayer tone=android.media.MediaPlayer.create(c,com.cartlyft.momowala.R.raw.cartlyft_attention);
        check(tone!=null && tone.getDuration()>=2400,"Bundled Cartlyft tone cannot be decoded");tone.release();
        PartnerAlerts.show(c,binding,"test-second","Second order","Keep ringing until this is acknowledged");
        // Expanding the notification tray must not be an acknowledgment.
        try(android.os.ParcelFileDescriptor ignored=getUiAutomation().executeShellCommand("cmd statusbar expand-notifications")) { }
        Thread.sleep(300);
        check(AlertPlaybackService.pending(c).contains("partner:"+key),"Opening notification tray acknowledged an order");
        java.lang.reflect.Field instanceField=AlertPlaybackService.class.getDeclaredField("instance");instanceField.setAccessible(true);
        java.lang.reflect.Field playerField=AlertPlaybackService.class.getDeclaredField("player");playerField.setAccessible(true);
        long soundDeadline=android.os.SystemClock.elapsedRealtime()+5000;
        boolean playing=false;
        while(android.os.SystemClock.elapsedRealtime()<soundDeadline) {
            Object service=instanceField.get(null);
            android.media.MediaPlayer actual=service==null?null:(android.media.MediaPlayer)playerField.get(service);
            if(actual!=null && actual.isPlaying() && actual.isLooping()){playing=true;break;}Thread.sleep(100);
        }
        check(playing,"Cartlyft tone is not looping after notification tray expansion");
        try(android.os.ParcelFileDescriptor ignored=getUiAutomation().executeShellCommand("cmd statusbar collapse")) { }
        check(posted.getNotification().actions.length==1,"Acknowledge action missing");
        posted.getNotification().actions[0].actionIntent.send();
        long deadline=android.os.SystemClock.elapsedRealtime()+3000;
        // The receiver commits acknowledgment and then removes playback in sequence.
        // Wait for both effects; observing the first commit alone races the second.
        while((!PartnerAlerts.prefs(c).contains("ack:"+key) || AlertPlaybackService.pending(c).contains("partner:"+key)) && android.os.SystemClock.elapsedRealtime()<deadline)Thread.sleep(50);
        check(PartnerAlerts.prefs(c).contains("ack:"+key),"Action did not persist acknowledgment");
        check(!AlertPlaybackService.pending(c).contains("partner:"+key),"Acknowledgment did not stop its playback");
        check(AlertPlaybackService.pending(c).contains("partner:test-second"),"Acknowledging one order silenced another");
        PartnerAlerts.acknowledge(c,"test-second");
        long stopDeadline=android.os.SystemClock.elapsedRealtime()+3000;
        while(instanceField.get(null)!=null && android.os.SystemClock.elapsedRealtime()<stopDeadline)Thread.sleep(50);
        check(instanceField.get(null)==null,"Playback service did not stop after final acknowledgment");
        PartnerAlerts.show(c,binding,key,"Duplicate","Should stay silent");
        for(android.service.notification.StatusBarNotification n:PartnerAlerts.manager(c).getActiveNotifications())check(!("partner:"+key).equals(n.getTag()),"Duplicate alert rang after acknowledgment");
        PartnerAlerts.show(c,"wrong-binding","wrong-account","Wrong account","Must be ignored");
        for(android.service.notification.StatusBarNotification n:PartnerAlerts.manager(c).getActiveNotifications())check(!"partner:wrong-account".equals(n.getTag()),"Old account message leaked");
        java.text.SimpleDateFormat f=new java.text.SimpleDateFormat("HH:mm",java.util.Locale.US);f.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
        String time=f.format(new java.util.Date(System.currentTimeMillis()+30*60000L));
        String date=OpeningSchedule.date(OpeningSchedule.businessOpening(time,System.currentTimeMillis()));
        InventoryReminders.configure(c,new org.json.JSONObject().put("cartId","test-cart").put("openTime",time).put("expiresAt",System.currentTimeMillis()+3600000L));
        java.util.Map<String,String> complete=new java.util.HashMap<>();
        complete.put("binding",binding);complete.put("cartId","test-cart");complete.put("date",date);complete.put("mode","stock_complete");
        PartnerMessagingService.handle(c,complete);
        check(date.equals(InventoryReminders.prefs(c).getString("completedDate","")),"Cross-phone completion not recorded");
        complete.put("mode","alert");complete.put("tag","delayed-reminder");
        PartnerMessagingService.handle(c,complete);
        for(android.service.notification.StatusBarNotification n:PartnerAlerts.manager(c).getActiveNotifications())check(!"partner:delayed-reminder".equals(n.getTag()),"Delayed reminder rang after stock completion");
        InventoryReminders.clear(c);
        PartnerAlerts.prefs(c).edit().clear().commit();
    }
    private Activity launchScreen() {
        ActivityMonitor monitor=addMonitor(MainActivity.class.getName(),null,false);
        try {
            runOnMainSync(()->getTargetContext().startActivity(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
            Activity screen=monitor.waitForActivityWithTimeout(5000);
            check(screen!=null,"Activity did not start");return screen;
        } finally {removeMonitor(monitor);}
    }
    private void testRequiredUpdateGate() throws Exception {
        Activity screen=launchScreen();
        final Throwable[] failure={null};
        runOnMainSync(()->{
            try {
                AppUpdater updater=new AppUpdater(screen);
                Method show=AppUpdater.class.getDeclaredMethod("showRequired",org.json.JSONObject.class); show.setAccessible(true);
                java.lang.reflect.Field field=AppUpdater.class.getDeclaredField("gate"); field.setAccessible(true);
                int next=getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(),0).versionCode+1;
                org.json.JSONObject info=new org.json.JSONObject().put("versionCode",next).put("minimumVersionCode",next).put("versionName","99.0.0").put("path","/downloads/cartlyft-99.0.0.apk").put("bytes",12).put("sha256",new String(new char[64]).replace('\0','a'));
                show.invoke(updater,info);
                android.app.Dialog gate=(android.app.Dialog)field.get(updater);
                check(gate!=null && gate.isShowing(),"Required update did not block the app");
                gate.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_BACK));
                gate.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_BACK));
                check(gate.isShowing(),"Back dismissed required update");
                show.invoke(updater,info.put("minimumVersionCode",0));
                check(!gate.isShowing(),"Withdrawn requirement still blocks app");
            } catch(Throwable e) { failure[0]=e; }
            finally { screen.finish(); }
        });
        if(failure[0]!=null)throw new AssertionError("Update gate regression",failure[0]);
    }
    private void testStartupBeforeLogin() throws Exception {
        android.content.SharedPreferences cache=getTargetContext().getSharedPreferences("update_policy",0);
        String saved=cache.getString("policy",null);
        int current=getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(),0).versionCode;
        org.json.JSONObject policy=new org.json.JSONObject().put("versionCode",current+1).put("minimumVersionCode",current+1).put("versionName","99.0.0").put("path","/downloads/cartlyft-99.0.0.apk").put("bytes",12).put("sha256",new String(new char[64]).replace('\0','a'));
        cache.edit().putString("policy",policy.toString()).commit();
        Activity screen=launchScreen();
        final Throwable[] failure={null};
        try {
            runOnMainSync(()->{
                try {
                    java.lang.reflect.Field webField=MainActivity.class.getDeclaredField("web");webField.setAccessible(true);
                    check(((WebView)webField.get(screen)).getUrl()==null,"Login loaded before required-update check");
                    java.lang.reflect.Field updaterField=MainActivity.class.getDeclaredField("updater");updaterField.setAccessible(true);
                    AppUpdater updater=(AppUpdater)updaterField.get(screen);
                    java.lang.reflect.Field gateField=AppUpdater.class.getDeclaredField("gate");gateField.setAccessible(true);
                    check(gateField.get(updater)!=null,"Cached mandatory update did not block pre-login startup");
                } catch(Throwable error) {failure[0]=error;}
            });
            if(failure[0]!=null)throw new AssertionError("Pre-login startup regression",failure[0]);
            // A fresh policy request must finish before the login callback can run.
            cache.edit().remove("policy").commit();
            java.util.concurrent.CountDownLatch release=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.atomic.AtomicBoolean opened=new java.util.concurrent.atomic.AtomicBoolean(false);
            org.json.JSONObject allowed=new org.json.JSONObject(policy.toString()).put("versionCode",current).put("minimumVersionCode",0);
            java.util.concurrent.atomic.AtomicInteger requests=new java.util.concurrent.atomic.AtomicInteger();
            AppUpdater isolated=new AppUpdater(screen,()->{requests.incrementAndGet();release.await(3,java.util.concurrent.TimeUnit.SECONDS);return allowed;});
            runOnMainSync(isolated::foreground);
            Thread.sleep(300);
            check(requests.get()==0,"Returning to foreground triggered an unsolicited update check");
            runOnMainSync(()->isolated.start(()->opened.set(true)));
            check(!opened.get(),"Startup did not wait for the version check");release.countDown();
            long deadline=android.os.SystemClock.elapsedRealtime()+4000;
            while(!opened.get() && android.os.SystemClock.elapsedRealtime()<deadline)Thread.sleep(50);
            check(opened.get(),"Current version did not continue to login");
            runOnMainSync(isolated::foreground);
            check(requests.get()==1,"Foreground repeated the completed startup check");
        } finally {
            runOnMainSync(screen::finish);
            if(saved==null)cache.edit().remove("policy").commit();else cache.edit().putString("policy",saved).commit();
        }
    }
    private void testUpdates() throws Exception {
        org.json.JSONObject info=new org.json.JSONObject().put("versionCode",5).put("versionName","1.3.0").put("path","/downloads/cartlyft-1.3.0.apk").put("bytes",12).put("sha256",new String(new char[64]).replace('\0','a'));
        AppUpdater.validateManifest(info);
        AppUpdater.validateManifest(new org.json.JSONObject(info.toString()).put("minimumVersionCode",5));
        for(int minimum:new int[]{-1,6}) {
            try { AppUpdater.validateManifest(new org.json.JSONObject(info.toString()).put("minimumVersionCode",minimum)); throw new AssertionError("Unpublished required version accepted"); } catch(java.io.IOException expected) { }
        }
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
        // Adaptive launcher masks make corner pixels transparent on newer Android.
        android.graphics.Bitmap background=bitmap;
        if(android.os.Build.VERSION.SDK_INT>=26 && icon instanceof android.graphics.drawable.AdaptiveIconDrawable) {
            background=android.graphics.Bitmap.createBitmap(216,216,android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.drawable.Drawable layer=((android.graphics.drawable.AdaptiveIconDrawable)icon).getBackground();
            layer.setBounds(0,0,216,216);layer.draw(new android.graphics.Canvas(background));
        }
        check(background.getPixel(4,4)==android.graphics.Color.rgb(217,35,68),"Partner icon background must be red");
        java.io.File output=new java.io.File(getTargetContext().getExternalFilesDir(null),"partner-icon.png");
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream(output)){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream);}
        check("Cartlyft Partner".contentEquals(getTargetContext().getApplicationInfo().loadLabel(getTargetContext().getPackageManager())),"Partner app label changed unexpectedly");
    }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
