import { sendDevicePush } from '../../server/devicePush.js';
import webpush from 'web-push';
import { backendHeaders, cronAuthorized, SB_URL } from '../../server/auth.js';
export async function deliverClosingAlerts() {
 const rpc=async(name,body={})=>{
  const r=await fetch(`${SB_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:backendHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Closing delivery unavailable');return r.json();
 };
 try {
  const deliveries=await rpc('app_claim_closing_notifications');
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:reminders@momowala.co.in',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  let sent=0,failed=0;
  for(let i=0;i<deliveries.length;i+=10)await Promise.all(deliveries.slice(i,i+10).map(async d=>{
   let ok=false,dead=false;
   try{await sendDevicePush(d,{title:d.title,body:d.body,tag:d.tag,url:'/',mode:d.mode,cartId:d.cartId,date:d.date});ok=true;sent++;}catch(e){failed++;dead=[404,410].includes(e.statusCode);}
   await rpc('app_finish_closing_notification',{p_id:d.id,p_endpoint:d.endpoint,p_tag:d.tag,p_lease:d.lease,p_sent:ok,p_dead:dead});
  }));
  return {status:failed?503:200,sent,failed};
 }catch{return {status:503,error:'Closing notification delivery will retry on the next scheduled run'};}
}
export default async function handler(req,res){if(!cronAuthorized(req))return res.status(401).json({error:'unauthorized'});const r=await deliverClosingAlerts();return res.status(r.status).json(r);}
