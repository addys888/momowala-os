import { useEffect, useState } from 'react';
import { nativeCommand } from '../lib/nativeApp';
import { requestHeaders } from '../lib/supabase';
import { useStore } from '../store';

export function NativeNotifications({cartId,role}) {
  const {session}=useStore();
  const [permissionNeeded,setPermissionNeeded]=useState(false);
  const [dismissed,setDismissed]=useState(false);
  useEffect(()=>{
    let active=true,running=false;
    const sync=async()=>{
      if(running)return;running=true;
      try {
        const actor=`${cartId}:${role}:${session?.staffId || session?.name || ''}`;
        let saved=JSON.parse(localStorage.getItem('mw:nativePush') || 'null');
        if(saved?.actor!==actor){saved={actor,binding:crypto.randomUUID()};localStorage.setItem('mw:nativePush',JSON.stringify(saved));}
        nativeCommand('bindNativePush',{binding:saved.binding,role,cartId});
        const state=nativeCommand('nativePushStatus');
        const permitted=state?.notifications ?? nativeCommand('inventoryStatus')?.notifications;
        if(active)setPermissionNeeded(permitted===false);
        if(!state?.configured || !state.token)return;
        await fetch('/api/push-subscribe',{method:'POST',headers:{'Content-Type':'application/json',...requestHeaders()},body:JSON.stringify({cartId,native:true,subscription:{endpoint:`fcm:${state.token}`,binding:saved.binding}})});
      }catch { /* Registration retries silently; device settings remain in the app menu. */ }
      finally{running=false;}
    };
    const visible=()=>{if(!document.hidden)void sync();};
    void sync();const timer=setInterval(sync,30000);window.addEventListener('focus',sync);document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',visible);};
  },[cartId,role,session?.name,session?.staffId]);
  if(!permissionNeeded||dismissed)return null;
  return <div className="notification-status" role="status">
    <span>Allow notifications to receive order and daily reminders.</span>
    <button className="text-button" onClick={()=>nativeCommand('notificationSettings')}>Enable notifications</button>
    <button className="text-button" aria-label="Dismiss notification reminder" onClick={()=>setDismissed(true)}>Later</button>
  </div>;
}
