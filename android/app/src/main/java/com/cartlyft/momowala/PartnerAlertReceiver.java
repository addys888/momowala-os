package com.cartlyft.momowala;
import android.content.*;
public final class PartnerAlertReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent) {
        if("cartlyft.ACK_ALL".equals(intent.getAction())) {
            AlertPlaybackService.acknowledgeAll(c);
        }
        if("cartlyft.ACK".equals(intent.getAction()) && intent.getStringExtra("key")!=null) PartnerAlerts.acknowledge(c,intent.getStringExtra("key"));
        if("cartlyft.SILENCE_CLOSING".equals(intent.getAction()) && intent.getStringExtra("key")!=null && intent.getStringExtra("key").startsWith("closing-")) AlertPlaybackService.acknowledgeAll(c);
        if("cartlyft.ACK_OPENING".equals(intent.getAction())) InventoryReminders.acknowledge(c);
    }
}
