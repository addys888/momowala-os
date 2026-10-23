package com.cartlyft.momowala;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;

import android.os.Build;
import org.json.JSONObject;

/** Persistent local acknowledgments prevent redelivered messages from re-ringing. */
public final class PartnerAlerts {
    static final String CHANNEL="partner_attention_v2";
    static final String INFO_CHANNEL="partner_updates_silent_v1";
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
            NotificationChannel info=new NotificationChannel(INFO_CHANNEL,"Cart updates (silent)",NotificationManager.IMPORTANCE_DEFAULT);
            info.setSound(null,null);info.enableVibration(false);manager(c).createNotificationChannel(info);
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
        prefs(c).edit().putString("role",data.optString("role","")).putString("cartId",data.optString("cartId","")).apply();
        for(String key:AlertPlaybackService.pending(c).getAll().keySet())
            if(key.startsWith("partner:")&&!rings(c,key.substring(8))) {manager(c).cancel(key,1);AlertPlaybackService.remove(c,key);}
        if(!"staff".equals(data.optString("role")))InventoryReminders.clear(c);
    }
    static boolean rings(Context c,String key) {
        return "staff".equals(prefs(c).getString("role","")) && key.startsWith("closing-manager-");
    }
    static synchronized void acknowledge(Context c,String key) {
        if(key==null || key.length()>200)return;
        prefs(c).edit().putLong("ack:"+key,System.currentTimeMillis()).apply();
        manager(c).cancel("partner:"+key,1);
        AlertPlaybackService.remove(c,"partner:"+key);
    }
    static synchronized void syncClosing(Context c,JSONObject data) throws Exception {
        String cart=data.getString("cartId"),binding=prefs(c).getString("binding","");
        org.json.JSONArray alerts=data.getJSONArray("alerts");
        java.util.Set<String> active=new java.util.HashSet<>();
        for(int i=0;i<alerts.length();i++) {
            JSONObject a=alerts.getJSONObject(i);String key=a.getString("key");
            if(!key.matches("closing-(manager|owner)-[0-9-]+"))continue;
            active.add(key);prefs(c).edit().putString("closingCart:"+key,cart).apply();
            show(c,binding,key,a.getString("title"),a.getString("body"));
        }
        for(java.util.Map.Entry<String,?> e:prefs(c).getAll().entrySet())
            if(e.getKey().startsWith("closingCart:") && cart.equals(e.getValue()) && !active.contains(e.getKey().substring(12)))acknowledge(c,e.getKey().substring(12));
    }
    static synchronized void show(Context c,String binding,String key,String title,String body) {
        if(!binding.matches("[0-9a-f-]{36}") || !binding.equals(prefs(c).getString("binding","")) || key.isEmpty() || key.length()>200)return;
        long now=System.currentTimeMillis();
        for(java.util.Map.Entry<String,?> e:prefs(c).getAll().entrySet())
            if(e.getKey().startsWith("ack:") && e.getValue() instanceof Long && now-(Long)e.getValue()>7*86400000L)prefs(c).edit().remove(e.getKey()).apply();
        if(prefs(c).contains("ack:"+key)){acknowledge(c,key);return;}
        boolean ring=rings(c,key);
        if(!ring)AlertPlaybackService.remove(c,"partner:"+key);
        if(ring && AlertPlaybackService.running() && AlertPlaybackService.pending(c).contains("partner:"+key))return;
        channel(c);
        Intent ack=new Intent(c,PartnerAlertReceiver.class).setAction(key.startsWith("closing-")?"cartlyft.SILENCE_CLOSING":"cartlyft.ACK").setData(android.net.Uri.parse("cartlyft-alert:"+android.net.Uri.encode(key))).putExtra("key",key);
        PendingIntent silence=PendingIntent.getBroadcast(c,0,ack,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String cart=prefs(c).getString("closingCart:"+key,prefs(c).getString("cartId",""));
        String target=key.startsWith("closing-")?"closing":key.startsWith("order-")?"orders":"stock";
        Intent launch=new Intent(c,MainActivity.class).setData(android.net.Uri.parse("cartlyft-notification:"+android.net.Uri.encode(key))).putExtra("notificationKey",key).putExtra("notificationBinding",binding).putExtra("notificationTarget",target).putExtra("notificationCart",cart).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(c,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String selectedChannel=ring?CHANNEL:INFO_CHANNEL;
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,selectedChannel):new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_cartlyft).setContentTitle(title).setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(open)
         .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE)
         .setPriority(ring?Notification.PRIORITY_HIGH:Notification.PRIORITY_DEFAULT).setOngoing(ring).setAutoCancel(!ring).setOnlyAlertOnce(true);
        if(ring && !key.startsWith("closing-"))b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Acknowledge",silence).build());
        else if(ring) {
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_view,"Open closing",open).build());
            b.addAction(new Notification.Action.Builder(android.R.drawable.ic_lock_silent_mode,"Silence ringtone",silence).build());
        }
        if(ring && Build.VERSION.SDK_INT<26)b.setSound(AlertSound.uri(c),AlertSound.attributes()).setVibrate(AlertSound.VIBRATION);
        boolean managed=ring && AlertPlaybackService.start(c,"partner:"+key,CHANNEL);
        if(managed) {
            if(Build.VERSION.SDK_INT>=26)b.setGroup("cartlyft-alerts").setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY);
            else b.setSound(null).setVibrate(null);
        }
        // Lock-screen copy exposes the task and controls, never cash, customer or staff details.
        Notification.Builder locked=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,selectedChannel):new Notification.Builder(c);
        locked.setSmallIcon(R.drawable.ic_stat_cartlyft).setContentTitle("Cartlyft Partner")
            .setContentText(key.startsWith("closing-manager-")?"Day-end closing needs submission":key.startsWith("closing-owner-")?"Closing report ready to review":"A partner update needs attention")
            .setVisibility(Notification.VISIBILITY_PUBLIC).setContentIntent(open).setOngoing(ring)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_view,key.startsWith("closing-")?"Open closing":"Open app",open).build());
        if(ring)locked.addAction(new Notification.Action.Builder(android.R.drawable.ic_lock_silent_mode,"Silence ringtone",silence).build());
        b.setPublicVersion(locked.build());
        Notification n=b.build();if(ring&&!managed)n.flags|=Notification.FLAG_INSISTENT;
        try {manager(c).notify("partner:"+key,1,n);}catch(SecurityException denied){/* User notification settings take precedence. */}
    }
}
