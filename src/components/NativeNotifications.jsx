import { useEffect, useState } from 'react';
import { nativeCommand } from '../lib/nativeApp';
import { requestHeaders } from '../lib/supabase';
import { useStore } from '../store';

export function NativeNotifications({cartId,role}) {
  const {session}=useStore();
  const [connected,setConnected]=useState(false);
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
        if(!state?.configured){if(active){setConnected(false);setMessage('Native background notifications need Firebase configuration.');}return;}
        if(!state.token){if(active){setConnected(false);setMessage('Connecting this phone to notifications…');}return;}
        const response=await fetch('/api/push-subscribe',{method:'POST',headers:{'Content-Type':'application/json',...requestHeaders()},body:JSON.stringify({cartId,native:true,subscription:{endpoint:`fcm:${state.token}`,binding:saved.binding}})});
        if(!response.ok)throw new Error('Could not register this phone. Check your connection.');
        const result=await response.json();
        if(!result.deliveryReady){if(active){setConnected(false);setMessage('Phone registered; server Firebase credentials still need configuration.');}return;}
        const permitted=state.notifications ?? nativeCommand('inventoryStatus')?.notifications;
        if(active){setConnected(permitted===true);setMessage(permitted===true?'Background alerts connected':'Allow notifications in Android settings.');}
      }catch(e){if(active){setConnected(false);setMessage(e.message || 'Could not connect notifications.');}}
      finally{running=false;}
    };
    void sync();const timer=setInterval(sync,30000);window.addEventListener('focus',sync);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync);};
  },[cartId,role,session?.name]);
  return <div className={`notification-status ${connected?'connected':''}`} role="status">
    {!connected && <span>{message}</span>}
    <button className="text-button" onClick={()=>nativeCommand('notificationSettings')}>{connected?'Alerts on · Settings':'Notification settings →'}</button>
  </div>;
}
