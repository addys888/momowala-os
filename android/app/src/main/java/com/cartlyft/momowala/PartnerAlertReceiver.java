package com.cartlyft.momowala;
import android.content.*;
public final class PartnerAlertReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent) {
        if("cartlyft.ACK_ALL".equals(intent.getAction())) {
            for(String key:AlertPlaybackService.pending(c).getAll().keySet()) {
                if(key.startsWith("partner:") && !key.startsWith("partner:closing-"))PartnerAlerts.acknowledge(c,key.substring(8));
                else if(key.equals("inventory"))InventoryReminders.acknowledge(c);
            }
        }
        if("cartlyft.ACK".equals(intent.getAction()) && intent.getStringExtra("key")!=null && !intent.getStringExtra("key").startsWith("closing-")) PartnerAlerts.acknowledge(c,intent.getStringExtra("key"));
        if("cartlyft.ACK_OPENING".equals(intent.getAction())) InventoryReminders.acknowledge(c);
    }
}
