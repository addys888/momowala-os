package com.cartlyft.momowala;
import android.content.*;
/** Explicit internal alarm receiver; system boot/time broadcasts only reschedule. */
public class InventoryReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if("cartlyft.OPENING".equals(intent.getAction())) InventoryReminders.fire(context);
        else InventoryReminders.schedule(context,false);
    }
}
