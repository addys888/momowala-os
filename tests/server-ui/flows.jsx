import '../../src/lib/compat';
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../src/MomoWalaOS';
import {getInitialState,TODAY} from '../../src/core';
import '../../src/index.css';
window.flow={errors:[],calls:[],alerts:[]};
window.addEventListener('error',e=>flow.errors.push(e.message));window.addEventListener('unhandledrejection',e=>flow.errors.push(String(e.reason)));
window.alert=m=>flow.alerts.push(m);window.confirm=()=>true;
window.prompt=(m,p)=>m==='cartlyft-native-v1'?JSON.stringify(['notificationTarget','appInfo'].includes(JSON.parse(p).command)?null:{configured:true,enabled:true,notifications:true,exact:true,token:'fixture-token',cartId:'momowala'}):null;
const role=new URLSearchParams(location.search).get('role')||'owner';
localStorage.clear();localStorage.setItem('mw:session',JSON.stringify({role,token:'11111111-1111-4111-8111-111111111111',cartId:'momowala',name:role==='staff'?'Test Staff':'Owner',expiresAt:Date.now()+3600000}));
// Legacy snapshots must never become order-list data.
localStorage.setItem('mw:orders',JSON.stringify([{id:999,cartId:'momowala',date:TODAY,staff:'LOCAL PHANTOM',total:99999}]));
history.replaceState(null,'',(role==='owner'?'/manage':'/work')+'?role='+role);
const seed=getInitialState();
const orders=[{id:101,cart_id:'momowala',date:TODAY,time:'06:30 pm',staff:'Sumit',total:70,token:'001',revision:1,items:[],payment:'cash',source:'staff-entry'},{id:102,cart_id:'momowala',date:TODAY,time:'08:30 pm',staff:'Akash',total:50,token:'002',revision:1,items:[],payment:'upi',source:'staff-entry'}];
let inbox=[{id:1,title:role==='owner'?'Order logged by Akash':'Tomorrow’s opening',body:'Fixture notification',target:role==='owner'?'orders':'inbox',business_date:TODAY,created_at:new Date().toISOString(),is_read:false}];
window.fixture={orders,inbox,failSave:false,delaySave:0};
window.fetch=async(input,init={})=>{
 const url=String(input);flow.calls.push(url);const p=init.body?JSON.parse(init.body):{};let data;
 if(url.includes('app_identity'))data={role,cartId:'momowala',name:role==='staff'?'Test Staff':'Owner',expiresAt:Date.now()+3600000};
 else if(url.includes('app_partner_bootstrap'))data={orders,stock_logs:[],cart_loadings:[],day_close_logs:[],wastage_logs:[],expenses:[],payout_marks:[],inventory:seed.inventory,staff:[{id:101,cart_id:'momowala',name:'Test Staff',mobile:'9999900001',active:true}],carts:[{id:'momowala',name:'Fixture Momo Wala',active:true,open_time:'15:00',close_time:'22:00'}],catalog:{carts:[]},menus:seed.menus};
 else if(url.includes('app_partner_inbox'))data={items:inbox,unread:inbox.filter(n=>!n.is_read).length};
 else if(url.includes('app_read_partner_notification')){inbox=inbox.map(n=>({...n,is_read:true}));data=null;}
 else if(url.includes('app_publish_announcement')){flow.announcement=p;data=44;}
 else if(url.includes('app_opening_status'))data={businessDate:TODAY,managerActive:true,canLoad:false,record:{actor_name:'Sumit',business_date:TODAY,created_at:new Date().toISOString(),quantities:{veg:100},reference_number:4}};
 else if(url.includes('app_closing_status'))data={settings:{},canSubmit:false,reports:[]};
 else if(url.includes('app_profit_day'))data={report:null,config:null};
 else if(url.includes('app_inventory'))data=seed.inventory;
 else if(url.includes('app_mutate')){
  if(fixture.delaySave)await new Promise(r=>setTimeout(r,fixture.delaySave));
  if(fixture.failSave)return new Response(JSON.stringify({code:'P0001',message:'Fixture server rejected order'}),{status:400});
  const op=p.p_kind==='batch'?p.p_commands[0]:{kind:p.p_kind,payload:p.p_payload};
  const row={...op.payload.after,revision:1,token:'003'};orders.push(row);
  data=p.p_commands?{status:'ok',results:[{status:'ok',order:row}]}:{status:'ok',order:row};
 }
 else if(url.includes('/orders'))data=orders;
 else if(url.includes('/api/push-subscribe'))data={deliveryReady:true};
 else if(url.includes('opening_loads')&&url.includes('business_date=eq.'))data=null;
 else if(url.includes('daily_packing')||url.includes('opening_loads')||url.includes('cart_loadings')||url.includes('staff_hr'))data=[];
 else return new Response(JSON.stringify({message:'Isolated fixture blocked unexpected request'}),{status:403});
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
window.started=performance.now();createRoot(document.getElementById('root')).render(<App/>);
