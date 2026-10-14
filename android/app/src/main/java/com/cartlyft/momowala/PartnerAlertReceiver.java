package com.cartlyft.momowala;
import android.content.*;
public final class PartnerAlertReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent) {
        if("cartlyft.ACK".equals(intent.getAction())) PartnerAlerts.acknowledge(c,intent.getStringExtra("key"));
        if("cartlyft.ACK_OPENING".equals(intent.getAction())) InventoryReminders.acknowledge(c);
    }
}
