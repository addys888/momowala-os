package com.cartlyft.momowala;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import java.util.*;

/** One audio/vibration loop for all unresolved alerts; opening the tray cannot silence it. */
public final class AlertPlaybackService extends Service {
    private static final int ID=4202;
    private static final String CHANNEL="cartlyft_playback";
    private static volatile AlertPlaybackService instance;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private Vibrator vibrator;
    private String playing;
    private boolean vibrating;
    private AudioFocusRequest focus;
    private boolean focusBlocked;
    private final AudioManager.OnAudioFocusChangeListener focusListener=change->{
        if(change<0) { focusBlocked=true;if(player!=null)player.pause();if(vibrator!=null)vibrator.cancel();vibrating=false; }
        else if(change==AudioManager.AUDIOFOCUS_GAIN) {focusBlocked=false;if(player!=null)player.start();reconcile();}
    };
    static boolean running() { return instance!=null; }
    static SharedPreferences pending(Context c) { return c.getSharedPreferences("ringing_alerts",MODE_PRIVATE); }
    static boolean start(Context c,String key,String channel) {
        pending(c).edit().putString(key,channel).commit();
        try {
            Intent intent=new Intent(c,AlertPlaybackService.class);
            if(Build.VERSION.SDK_INT>=26)c.startForegroundService(intent); else c.startService(intent);
            return true;
        } catch(RuntimeException denied) { return false; } // Native notification sound remains the fallback.
    }
    static void remove(Context c,String key) {
        pending(c).edit().remove(key).commit();
        if(instance!=null)instance.handler.post(()->{if(instance!=null)instance.reconcile();});
    }
    static void clearPartner(Context c) {
        for(String key:pending(c).getAll().keySet())if(key.startsWith("partner:"))remove(c,key);
    }
    @Override public void onCreate() { super.onCreate();instance=this;vibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE); }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Active alert playback",NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null,null);channel.enableVibration(false);nm.createNotificationChannel(channel);
        }
        PendingIntent open=PendingIntent.getActivity(this,4202,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent ack=PendingIntent.getBroadcast(this,4202,new Intent(this,PartnerAlertReceiver.class).setAction("cartlyft.ACK_ALL"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        startForeground(ID,b.setSmallIcon(R.drawable.ic_stat_cartlyft).setContentTitle("Cartlyft needs your attention")
            .setContentText("Silence sound here. Complete closing and review reports in the app.").setGroup("cartlyft-alerts").setGroupSummary(true).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Silence alerts",ack).build()).build());
        handler.removeCallbacks(tick);reconcile();handler.postDelayed(tick,1000);
        return START_STICKY;
    }
    private final Runnable tick=new Runnable(){public void run(){reconcile();if(!pending(AlertPlaybackService.this).getAll().isEmpty())handler.postDelayed(this,1000);}};
    private void reconcile() {
        // Migrate old queued order/owner alarms before playback can restart after an update.
        for(String key:pending(this).getAll().keySet()) {
            if((key.startsWith("partner:")&&!PartnerAlerts.rings(this,key.substring(8))) || (key.equals("inventory")&&!"staff".equals(PartnerAlerts.prefs(this).getString("role","")))) {
                pending(this).edit().remove(key).commit();
                if(key.startsWith("partner:"))((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).cancel(key,1);
            }
        }
        Map<String,?> entries=pending(this).getAll();
        if(entries.isEmpty()) { stopOutput();stopForeground(true);stopSelf();return; }
        if(focusBlocked)return;
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        Uri sound=null; boolean vibrate=false;
        if(nm.areNotificationsEnabled())for(Object value:entries.values()) {
            if(Build.VERSION.SDK_INT>=26) {
                NotificationChannel channel=nm.getNotificationChannel(String.valueOf(value));
                if(channel==null || channel.getImportance()<NotificationManager.IMPORTANCE_DEFAULT)continue;
                if(sound==null)sound=channel.getSound();vibrate|=channel.shouldVibrate();
            } else {sound=AlertSound.uri(this);vibrate=true;}
        }
        if(sound==null)stopAudio();
        else if(player==null || !sound.toString().equals(playing)) {
            stopAudio();
            try {
                AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);
                int granted;
                if(Build.VERSION.SDK_INT>=26) {focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(AlertSound.attributes()).setOnAudioFocusChangeListener(focusListener).build();granted=audio.requestAudioFocus(focus);}
                else granted=audio.requestAudioFocus(focusListener,AudioManager.STREAM_ALARM,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
                if(granted==AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                    player=new MediaPlayer();player.setAudioAttributes(AlertSound.attributes());player.setDataSource(this,sound);
                    player.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);player.setLooping(true);player.prepare();player.start();playing=sound.toString();
                }
            } catch(Exception failed) {stopAudio();}
        }
        if(vibrate && !vibrating && vibrator!=null && vibrator.hasVibrator()) {
            if(Build.VERSION.SDK_INT>=26)vibrator.vibrate(VibrationEffect.createWaveform(AlertSound.VIBRATION,new int[]{0,255,0,255,0,255,0},0),AlertSound.attributes());
            else vibrator.vibrate(AlertSound.VIBRATION,0,AlertSound.attributes());
            vibrating=true;
        } else if(!vibrate && vibrating) {vibrator.cancel();vibrating=false;}
    }
    private void stopAudio() {
        if(player!=null){player.release();player=null;}playing=null;
        AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);
        if(Build.VERSION.SDK_INT>=26 && focus!=null){audio.abandonAudioFocusRequest(focus);focus=null;}
        else audio.abandonAudioFocus(focusListener);
    }
    private void stopOutput() {stopAudio();if(vibrator!=null)vibrator.cancel();vibrating=false;}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);stopOutput();instance=null;super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
