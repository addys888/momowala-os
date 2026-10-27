import webpush from 'web-push';
import {sendDevicePush} from './devicePush.js';
import {backendHeaders,SB_URL} from './auth.js';
export async function deliverPartnerNotifications(){
 const rpc=async(name,body={})=>{
  const r=await fetch(`${SB_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:backendHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Notification delivery unavailable');return r.status===204?null:r.json();
 };
 try{
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:reminders@momowala.co.in',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  const deliveries=await rpc('app_claim_partner_notifications');let sent=0,failed=0;
  for(let i=0;i<deliveries.length;i+=10)await Promise.all(deliveries.slice(i,i+10).map(async d=>{
   let ok=false,dead=false;
   try{await sendDevicePush(d,{...d,url:'/',mode:'info'});ok=true;sent++;}catch(e){failed++;dead=[404,410].includes(e.statusCode);}
   await rpc('app_finish_partner_notification',{p_id:d.id,p_endpoint:d.endpoint,p_lease:d.lease,p_sent:ok,p_dead:dead});
  }));
  return {status:failed?503:200,sent,failed};
 }catch{return {status:503,error:'Notification delivery will retry'};}
}
