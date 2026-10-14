import { useEffect, useState } from 'react';
import { nativeCommand } from '../lib/nativeApp';
import { requestHeaders } from '../lib/supabase';
import { useStore } from '../store';

export function NativeNotifications({cartId,role}) {
  const {session}=useStore();
  const [message,setMessage]=useState('Checking Android notifications…');
  useEffect(()=>{
    let active=true,running=false;
    const sync=async()=>{
      if(running)return;running=true;
      try {
        const actor=`${cartId}:${role}:${session?.name || ''}`;
        let saved=JSON.parse(localStorage.getItem('mw:nativePush') || 'null');
        if(saved?.actor!==actor){saved={actor,binding:crypto.randomUUID()};localStorage.setItem('mw:nativePush',JSON.stringify(saved));}
        nativeCommand('bindNativePush',{binding:saved.binding});
        const state=nativeCommand('nativePushStatus');
        if(!state?.configured){if(active)setMessage('Native background notifications need Firebase configuration.');return;}
        if(!state.token){if(active)setMessage('Connecting this phone to notifications…');return;}
        const response=await fetch('/api/push-subscribe',{method:'POST',headers:{'Content-Type':'application/json',...requestHeaders()},body:JSON.stringify({cartId,native:true,subscription:{endpoint:`fcm:${state.token}`,binding:saved.binding}})});
        if(!response.ok)throw new Error('Could not register this phone. Check your connection.');
        const result=await response.json();
        if(!result.deliveryReady){if(active)setMessage('Phone registered; server Firebase credentials still need configuration.');return;}
        if(active)setMessage('Background alerts connected. Acknowledge each alert to stop its sound and vibration.');
      }catch(e){if(active)setMessage(e.message || 'Could not connect notifications.');}
      finally{running=false;}
    };
    void sync();const timer=setInterval(sync,30000);window.addEventListener('focus',sync);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync);};
  },[cartId,role,session?.name]);
  return <section aria-label="Android notifications" style={{padding:14,background:'#F1F5F9',borderRadius:12,marginBottom:14,fontSize:13,lineHeight:1.6}}>
    <strong>Android alerts</strong><p>{message}</p>
    <button onClick={()=>nativeCommand('notificationSettings')} style={{minHeight:44,padding:10,marginTop:8,border:'1px solid #CCD6E0',borderRadius:8,background:'#fff'}}>Notification sound & permissions</button>
    <p style={{fontSize:11,color:'#617184'}}>Alerts remain assigned after logout. Android notification, sound and Do Not Disturb settings apply. Acknowledging silences this phone; it does not submit inventory or accept an order.</p>
  </section>;
}
