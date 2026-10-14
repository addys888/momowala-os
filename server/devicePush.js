import webpush from 'web-push';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export async function sendDevicePush(subscription, payload) {
  if (!subscription.endpoint.startsWith('fcm:')) {
    return webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{TTL:3600,timeout:8000});
  }
  const config=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || 'null');
  if(!config?.project_id || !config?.private_key || !config?.client_email)throw new Error('Native push credentials not configured');
  let app=getApps().find(a=>a.name==='cartlyft-push');
  if(!app)app=initializeApp({credential:cert(config),projectId:config.project_id},'cartlyft-push');
  try {
    return await getMessaging(app).send({token:subscription.endpoint.slice(4),android:{priority:'high',ttl:3600000},
      data:{binding:subscription.p256dh,tag:String(payload.tag),title:String(payload.title),body:String(payload.body),mode:payload.mode || 'alert',cartId:payload.cartId || '',date:payload.date || ''}});
  }catch(e){
    if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code))e.statusCode=410;
    throw e;
  }
}
