import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
process.env.VITE_SUPABASE_URL='http://localhost:1';
process.env.VITE_SUPABASE_ANON_KEY='fixture';
process.env.CRON_SECRET='fixture-secret';
const {default: handler,deliverOpeningAlerts}=await import('../api/cron/opening-alerts.js');
const res=()=>({code:null,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const fixture={id:1,lease:crypto.randomUUID(),endpoint:'https://fcm.googleapis.com/fixture',p256dh:'key',auth:'auth',title:'Loaded',body:'Manager loaded stock'};
const fetchBefore=global.fetch, sendBefore=webpush.sendNotification, configBefore=webpush.setVapidDetails;
const mock=(deliveries)=>{
 const calls=[];
 global.fetch=async(url,options)=>{
  const name=url.split('/').at(-1);calls.push({name,body:JSON.parse(options.body),headers:options.headers});
  return {ok:true,json:async()=>name==='app_claim_opening_notifications'?deliveries:null};
 };
 webpush.setVapidDetails=()=>{};
 process.env.VAPID_PUBLIC_KEY='test';process.env.VAPID_PRIVATE_KEY='test';
 return calls;
};
test.after(()=>{global.fetch=fetchBefore;webpush.sendNotification=sendBefore;webpush.setVapidDetails=configBefore;});
test('opening endpoint refuses callers without scheduler credentials',async()=>{
 const calls=mock([]),r=res();await handler({headers:{},query:{}},r);
 assert.equal(r.code,401);assert.equal(calls.length,0);
});
test('owner inbox collection continues when push configuration is missing',async()=>{
 const calls=mock([]);delete process.env.VAPID_PRIVATE_KEY;
 const result=await deliverOpeningAlerts();assert.equal(result.status,503);
 assert.equal(calls[0].name,'app_claim_opening_notifications');
});
test('successful pushes acknowledge the exact lease; failed devices remain retryable',async()=>{
 const calls=mock([fixture,{...fixture,endpoint:'https://fcm.googleapis.com/failing'}]);
 webpush.sendNotification=async subscription=>{if(subscription.endpoint.endsWith('failing'))throw new Error('offline');};
 const result=await deliverOpeningAlerts();assert.equal(result.sent,1);assert.equal(result.failed,1);assert.equal(result.status,503);
 const acknowledgments=calls.filter(c=>c.name==='app_finish_opening_notification');
 assert.equal(acknowledgments.length,2);assert.equal(acknowledgments[0].body.p_lease,fixture.lease);
 assert.equal(acknowledgments.find(c=>c.body.p_endpoint===fixture.endpoint).body.p_sent,true);
 assert.equal(acknowledgments.find(c=>c.body.p_endpoint.endsWith('failing')).body.p_sent,false);
});
test('expired push subscriptions are retired without retry storms',async()=>{
 const calls=mock([fixture]);webpush.sendNotification=async()=>{throw Object.assign(new Error('gone'),{statusCode:410});};
 await deliverOpeningAlerts();assert.equal(calls.at(-1).body.p_dead,true);
});
