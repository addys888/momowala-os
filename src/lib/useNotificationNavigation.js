import {useEffect} from 'react';
import {nativeCommand} from './nativeApp';
export function useNotificationNavigation(cartId,owner,setTab) {
 useEffect(()=>{
  const read=()=>{
   const link=nativeCommand('notificationTarget',{cartId});
   if(!link)return;
   if(link.target==='inbox'){window.dispatchEvent(new Event('mw:open-inbox'));return;}
   const tab=link.target==='closing'?(owner?'reconcile':'order'):link.target==='orders'?(owner?'orders':'pending'):(owner?'inventory':'stock');
   setTab(tab);
   if(link.target==='closing')setTimeout(()=>{window.dispatchEvent(new Event('mw:open-closing'));document.querySelector('[aria-label="Daily closing"]')?.scrollIntoView({block:'start'});},100);
  };
  const navigate=e=>{const link=e.detail;if(link.cartId!==cartId)return;setTab(link.target==='closing'?(owner?'reconcile':'order'):link.target==='orders'?(owner?'orders':'pending'):(owner?'inventory':'stock'));};
  window.addEventListener('mw:navigate-notification',navigate);
  read();const timer=setInterval(read,1000);window.addEventListener('focus',read);
  return()=>{window.removeEventListener('mw:navigate-notification',navigate);clearInterval(timer);window.removeEventListener('focus',read);};
 },[cartId,owner,setTab]);
}
