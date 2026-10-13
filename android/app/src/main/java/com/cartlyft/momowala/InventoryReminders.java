package com.cartlyft.momowala;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import org.json.JSONObject;
import java.util.*;

/** Local schedule only: stores no session token, stock quantities or customer data. */
public final class InventoryReminders {
    static final String CHANNEL = "opening_inventory_v1";
    static final int ID = 4201;
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("inventory_reminder", Context.MODE_PRIVATE); }
    static AlarmManager alarms(Context c) { return (AlarmManager)c.getSystemService(Context.ALARM_SERVICE); }
    static PendingIntent intent(Context c) { return PendingIntent.getBroadcast(c,ID,new Intent(c,InventoryReminderReceiver.class).setAction("cartlyft.OPENING"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE); }
    static void channel(Context c) {
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Opening inventory",NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminder to load the cart 30 minutes before opening");
            channel.enableVibration(true); channel.setVibrationPattern(new long[]{0,700,300,700});
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            manager(c).createNotificationChannel(channel);
        }
    }
    static NotificationManager manager(Context c) { return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); }
    static JSONObject status(Context c) throws Exception {
        channel(c); boolean notifications=manager(c).areNotificationsEnabled();
        if(Build.VERSION.SDK_INT>=26) notifications &= manager(c).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
        return new JSONObject().put("enabled",prefs(c).getBoolean("enabled",false)).put("cartId",prefs(c).getString("cartId","" )).put("notifications",notifications)
            .put("exact",Build.VERSION.SDK_INT<31 || alarms(c).canScheduleExactAlarms());
    }
    static void configure(Context c,JSONObject data) throws Exception {
        String cart=data.getString("cartId"), time=data.getString("openTime"); long expires=data.getLong("expiresAt");
        if(cart.length()>100 || !time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]") || expires<=System.currentTimeMillis()) throw new IllegalArgumentException("Invalid schedule");
        boolean same=cart.equals(prefs(c).getString("cartId",""));
        if(!same && prefs(c).getBoolean("enabled",false)) throw new IllegalArgumentException("Unassign this phone before changing carts");
        if(!same) clear(c);
        android.content.SharedPreferences.Editor e=prefs(c).edit().putString("cartId",cart).putString("openTime",time).remove("expiresAt");
        String done=data.optString("completedDate","");
        if(done.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) e.putString("completedDate",done);
        e.apply();
        if(OpeningSchedule.date(OpeningSchedule.businessOpening(time,System.currentTimeMillis())).equals(done)) manager(c).cancel(ID);
        schedule(c,false);
    }
    static void clear(Context c) { alarms(c).cancel(intent(c)); manager(c).cancel(ID); prefs(c).edit().clear().apply(); }
    static void schedule(Context c,boolean repeat) {
        alarms(c).cancel(intent(c));
        if(!prefs(c).getBoolean("enabled",false)) { manager(c).cancel(ID); return; }
        String time=prefs(c).getString("openTime",""); if(time.isEmpty())return;
        long now=System.currentTimeMillis();
        long next=OpeningSchedule.next(time,now,prefs(c).getString("completedDate",""),repeat);
        try {
            if(Build.VERSION.SDK_INT<31 || alarms(c).canScheduleExactAlarms()) alarms(c).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,intent(c));
            else alarms(c).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,intent(c));
        } catch(SecurityException denied) { alarms(c).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,intent(c)); }
    }
    static void fire(Context c) {
        long now=System.currentTimeMillis();
        if(!prefs(c).getBoolean("enabled",false)) { clear(c); return; }
        String time=prefs(c).getString("openTime",""); if(time.isEmpty()) return;
        long open=OpeningSchedule.businessOpening(time,now);
        if(now<open-30*60_000L || OpeningSchedule.date(open).equals(prefs(c).getString("completedDate",""))) { schedule(c,false); return; }
        channel(c);
        Intent launch=new Intent(c,MainActivity.class).putExtra("openingInventory",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content=PendingIntent.getActivity(c,ID,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Prepare opening inventory")
         .setContentText("Load today's stock into the cart. Tap to review and save quantities.")
         .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE)
         .setPriority(Notification.PRIORITY_HIGH).setContentIntent(content).setOngoing(true).setAutoCancel(false);
        if(Build.VERSION.SDK_INT<26) b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()).setVibrate(new long[]{0,700,300,700});
        Notification n=b.build(); n.flags|=Notification.FLAG_INSISTENT;
        try { manager(c).notify(ID,n); } catch(SecurityException denied) { /* Permission status is visible in the app. */ }
        schedule(c,true);
    }
}
