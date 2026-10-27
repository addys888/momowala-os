import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
process.env.VITE_SUPABASE_URL='https://fixture.invalid';
process.env.VITE_SUPABASE_ANON_KEY='fixture';process.env.CRON_SECRET='fixture';
const keys=webpush.generateVAPIDKeys();process.env.VAPID_PUBLIC_KEY=keys.publicKey;process.env.VAPID_PRIVATE_KEY=keys.privateKey;process.env.VAPID_SUBJECT='mailto:test@example.com';
const {deliverClosingAlerts}=await import('../api/cron/closing-alerts.js');
const {deliverOpeningAlerts}=await import('../api/cron/opening-alerts.js');
const {deliverPartnerNotifications}=await import('../server/partnerNotifications.js');
for(const [label,deliver] of [['closing',deliverClosingAlerts],['opening',deliverOpeningAlerts],['inbox',deliverPartnerNotifications]]) {
 test(`${label}: successful push and empty database acknowledgement succeeds`,async()=>{
  const fetchBefore=globalThis.fetch,sendBefore=webpush.sendNotification;let sent=0,finished=0;
  webpush.sendNotification=async()=>{sent++;};
  globalThis.fetch=async(url)=>{
   if(url.includes('app_claim_'))return Response.json([{id:1,endpoint:'https://push.example.test',p256dh:'fixture',auth:'fixture',lease:'fixture',tag:'fixture',title:'Stock submitted',body:'Manager saved stock',mode:'info'}]);
   assert.ok(url.includes('app_finish_'));finished++;return new Response(null,{status:204});
  };
  try {assert.deepEqual(await deliver(),{status:200,sent:1,failed:0});assert.equal(sent,1);assert.equal(finished,1);}
  finally{globalThis.fetch=fetchBefore;webpush.sendNotification=sendBefore;}
 });
}
