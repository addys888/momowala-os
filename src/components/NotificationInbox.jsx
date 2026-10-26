import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell,X} from 'lucide-react';
import {useStore} from '../store';
import {supabase} from '../lib/supabase';
import {localDate,istTime} from '../lib/time';

export function NotificationInbox() {
 const {session}=useStore()||{};
 const cartId=session?.cartId;
 const [open,setOpen]=useState(false),[items,setItems]=useState([]),[unread,setUnread]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[notice,setNotice]=useState('');
 const operation=useRef(null),loading=useRef(false),binding=useRef(session?.token);
 binding.current=session?.token;
 const read=useCallback(async(before=null)=>{
  if(!cartId||loading.current)return;
  const token=session?.token;loading.current=true;
  try {
   const {data,error}=await supabase.rpc('app_partner_inbox',{p_cart_id:cartId,p_before:before});
   if(binding.current!==token)return;
   if(error)throw error;
   setItems(prev=>before?[...new Map([...prev,...data.items].map(i=>[i.id,i])).values()]:data.items);
   setUnread(data.unread);setMore(data.items.length===30);setError('');
  }catch(e){if(binding.current===token)setError('Notifications could not be refreshed. Please retry.');}
  finally{loading.current=false;}
 },[cartId,session?.token]);
 useEffect(()=>{
  setItems([]);setUnread(0);setOpen(false);
  void read();const refresh=()=>{if(!document.hidden)void read();};const timer=setInterval(refresh,30000);
  const show=()=>{setOpen(true);void read();};window.addEventListener('focus',refresh);window.addEventListener('mw:open-inbox',show);
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('mw:open-inbox',show);};
 },[read]);
 if(!cartId)return null;
 const select=async item=>{
  const {error}=await supabase.rpc('app_read_partner_notification',{p_id:item.id});
  if(error){setError('Could not mark this notification read. Please retry.');return;}
  setItems(prev=>prev.map(n=>n.id===item.id?{...n,is_read:true}:n));
  if(!item.is_read)setUnread(n=>Math.max(0,n-1));
  if(item.target!=='inbox'){setOpen(false);window.dispatchEvent(new CustomEvent('mw:navigate-notification',{detail:{cartId,target:item.target,date:item.business_date}}));}
 };
 const publish=async()=>{
  if(busy)return;setBusy(true);setNotice('');
  if(!operation.current)operation.current={id:crypto.randomUUID(),title:title.trim(),body:body.trim()};
  try{
   const p=operation.current;
   const {error}=await supabase.rpc('app_publish_announcement',{p_cart_id:cartId,p_operation_id:p.id,p_title:p.title,p_body:p.body});
   if(error)throw error;
   operation.current=null;setTitle('');setBody('');setNotice('Announcement published to your staff inbox. Phone notifications are queued for delivery.');
  }catch(e){setNotice(e.message||'Could not confirm publication. Retry the same announcement.');}
  finally{setBusy(false);}
 };
 return <>
  <button aria-label={`Notifications${unread?`, ${unread} unread`:''}`} onClick={()=>{setOpen(true);void read();}} style={{position:'relative',width:44,height:44,border:0,background:'transparent',color:'inherit',flexShrink:0}}><Bell size={22}/>{unread>0&&<span style={{position:'absolute',right:0,top:0,background:'#c51935',color:'#fff',fontSize:10,borderRadius:12,padding:'2px 5px'}}>{unread>99?'99+':unread}</span>}</button>
  {open&&<div role="dialog" aria-modal="true" aria-label="Notifications" style={{position:'fixed',inset:0,zIndex:200,background:'#f4f6f9',color:'#152d44',overflowY:'auto',padding:20}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h1 style={{fontSize:22}}>Notifications</h1><button aria-label="Close notifications" onClick={()=>setOpen(false)} style={{minWidth:44,minHeight:44}}><X/></button></div>
   {['owner','admin'].includes(session.role)&&<details className="partner-card"><summary>Publish announcement to staff</summary><label>Title<input value={title} maxLength={100} disabled={busy||!!operation.current} onChange={e=>setTitle(e.target.value)} style={{display:'block',width:'100%',minHeight:44}}/></label><label>Message<textarea value={body} maxLength={2000} disabled={busy||!!operation.current} onChange={e=>setBody(e.target.value)} style={{display:'block',width:'100%',minHeight:100}}/></label><button disabled={busy||!title.trim()||!body.trim()} onClick={publish} style={{minHeight:44}}>{busy?'Publishing…':'Publish to staff'}</button>{notice&&<p role="status">{notice}</p>}</details>}
   {error&&<p role="alert">{error} <button onClick={()=>read()}>Retry</button></p>}
   {!items.length&&!error&&<p>No notifications yet.</p>}
   {items.map(item=><button key={item.id} onClick={()=>select(item)} style={{display:'block',textAlign:'left',width:'100%',background:item.is_read?'#fff':'#e9f2fc',border:'1px solid #dce3ea',borderRadius:12,padding:16,marginBottom:10,color:'inherit'}}><strong>{item.title}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.body}</p><small>{localDate(new Date(item.created_at))} · {istTime(new Date(item.created_at))} IST{item.is_read?'':' · Unread'}</small></button>)}
   {more&&<button onClick={()=>read(items.at(-1)?.id)} style={{minHeight:44}}>Load older notifications</button>}
  </div>}
 </>;
}
