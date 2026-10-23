import {useEffect} from 'react';
import {nativeCommand} from './nativeApp';
export function useNotificationNavigation(cartId,owner,setTab) {
 useEffect(()=>{
  const read=()=>{
   const link=nativeCommand('notificationTarget',{cartId});
   if(!link)return;
   const tab=link.target==='closing'?(owner?'reconcile':'order'):link.target==='orders'?(owner?'orders':'pending'):(owner?'inventory':'stock');
   setTab(tab);
   if(link.target==='closing')setTimeout(()=>document.querySelector('[aria-label="Daily closing"]')?.scrollIntoView({block:'start'}),100);
  };
  read();const timer=setInterval(read,1000);window.addEventListener('focus',read);
  return()=>{clearInterval(timer);window.removeEventListener('focus',read);};
 },[cartId,owner,setTab]);
}
