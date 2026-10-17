package com.cartlyft.momowala;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;

import android.os.Build;
import org.json.JSONObject;

/** Persistent local acknowledgments prevent redelivered messages from re-ringing. */
public final class PartnerAlerts {
    static final String CHANNEL="partner_attention_v2";
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("partner_alerts",Context.MODE_PRIVATE); }
    static NotificationManager manager(Context c) { return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); }
    static void channel(Context c) {
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Partner alerts requiring acknowledgment",NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);channel.setVibrationPattern(AlertSound.VIBRATION);
            channel.setSound(AlertSound.uri(c),AlertSound.attributes());
            NotificationChannel old=manager(c).getNotificationChannel("partner_attention_v1");
            if(old!=null) {
                channel.setImportance(old.getImportance());
                if(old.getSound()==null)channel.setSound(null,AlertSound.attributes());
                channel.enableVibration(old.shouldVibrate());
            }
            manager(c).createNotificationChannel(channel);
        }
    }
    static synchronized void bind(Context c,JSONObject data) throws Exception {
        String binding=data.getString("binding");
        if(!binding.matches("[0-9a-f-]{36}"))throw new IllegalArgumentException();
        if(!binding.equals(prefs(c).getString("binding",""))) {
            for(android.service.notification.StatusBarNotification n:manager(c).getActiveNotifications())
                if(n.getTag()!=null && n.getTag().startsWith("partner:"))manager(c).cancel(n.getTag(),1);
            AlertPlaybackService.clearPartner(c);
            prefs(c).edit().clear().putString("binding",binding).apply();
        }
    }
    static synchronized void acknowledge(Context c,String key) {
        if(key==null || key.length()>200)return;
        prefs(c).edit().putLong("ack:"+key,System.currentTimeMillis()).apply();
        manager(c).cancel("partner:"+key,1);
        AlertPlaybackService.remove(c,"partner:"+key);
    }
    static synchronized void show(Context c,String binding,String key,String title,String body) {
        if(!binding.matches("[0-9a-f-]{36}") || !binding.equals(prefs(c).getString("binding","")) || key.isEmpty() || key.length()>200)return;
        long now=System.currentTimeMillis();
        for(java.util.Map.Entry<String,?> e:prefs(c).getAll().entrySet())
            if(e.getKey().startsWith("ack:") && e.getValue() instanceof Long && now-(Long)e.getValue()>7*86400000L)prefs(c).edit().remove(e.getKey()).apply();
        if(prefs(c).contains("ack:"+key))return;
        channel(c);
        Intent ack=new Intent(c,PartnerAlertReceiver.class).setAction("cartlyft.ACK").setData(android.net.Uri.parse("cartlyft-alert:"+android.net.Uri.encode(key))).putExtra("key",key);
        PendingIntent silence=PendingIntent.getBroadcast(c,0,ack,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(open)
         .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE)
         .setPriority(Notification.PRIORITY_HIGH).setOngoing(true).setAutoCancel(false).setOnlyAlertOnce(true)
         .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Acknowledge",silence).build());
        if(Build.VERSION.SDK_INT<26)b.setSound(AlertSound.uri(c),AlertSound.attributes()).setVibrate(AlertSound.VIBRATION);
        boolean managed=AlertPlaybackService.start(c,"partner:"+key,CHANNEL);
        if(managed) {
            if(Build.VERSION.SDK_INT>=26)b.setGroup("cartlyft-alerts").setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY);
            else b.setSound(null).setVibrate(null);
        }
        Notification n=b.build();if(!managed)n.flags|=Notification.FLAG_INSISTENT;
        try {manager(c).notify("partner:"+key,1,n);}catch(SecurityException denied){/* User notification settings take precedence. */}
    }
}
