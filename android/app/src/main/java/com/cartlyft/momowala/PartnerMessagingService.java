package com.cartlyft.momowala;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
public final class PartnerMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) { getSharedPreferences("fcm",MODE_PRIVATE).edit().putString("token",token).apply(); }
    @Override public void onMessageReceived(RemoteMessage message) {
        handle(this,message.getData());
    }
    static void handle(android.content.Context c,Map<String,String> d) {
        String binding=d.getOrDefault("binding","");
        if(!binding.matches("[0-9a-f-]{36}") || !binding.equals(PartnerAlerts.prefs(c).getString("binding","")))return;
        String date=d.getOrDefault("date",""),cart=d.getOrDefault("cartId","");
        if("stock_complete".equals(d.get("mode"))) {
            if(!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))return;
            if(cart.equals(InventoryReminders.prefs(c).getString("cartId",""))) {
                String previous=InventoryReminders.prefs(c).getString("completedDate","");
                if(date.compareTo(previous)>0)InventoryReminders.prefs(c).edit().putString("completedDate",date).apply();
                String time=InventoryReminders.prefs(c).getString("openTime","");
                if(!time.isEmpty() && date.equals(OpeningSchedule.date(OpeningSchedule.businessOpening(time,System.currentTimeMillis()))))InventoryReminders.manager(c).cancel(InventoryReminders.ID);
                InventoryReminders.schedule(c,false);
            }
            for(java.util.Map.Entry<String,?> e:PartnerAlerts.prefs(c).getAll().entrySet())
                if(e.getKey().startsWith("event:") && (cart+":"+date).equals(e.getValue()))PartnerAlerts.acknowledge(c,e.getKey().substring(6));
            return;
        }
        String key=d.getOrDefault("tag","");
        if(!cart.isEmpty() && !date.isEmpty())PartnerAlerts.prefs(c).edit().putString("event:"+key,cart+":"+date).apply();
        if(!cart.isEmpty() && cart.equals(InventoryReminders.prefs(c).getString("cartId","")) && !date.isEmpty() && date.compareTo(InventoryReminders.prefs(c).getString("completedDate",""))<=0)return;
        PartnerAlerts.show(c,d.getOrDefault("binding",""),d.getOrDefault("tag",""),d.getOrDefault("title","Cartlyft"),d.getOrDefault("body","Open Cartlyft to review."));
    }
    static org.json.JSONObject status(android.content.Context c) throws Exception {
        boolean configured=com.google.firebase.FirebaseApp.initializeApp(c)!=null;
        if(configured)com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->c.getSharedPreferences("fcm",MODE_PRIVATE).edit().putString("token",token).apply());
        return new org.json.JSONObject().put("configured",configured).put("token",c.getSharedPreferences("fcm",MODE_PRIVATE).getString("token",""));
    }
}
