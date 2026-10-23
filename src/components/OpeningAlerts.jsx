import { openingBusinessDate } from '../lib/openingInventory';
import { nativeCommand } from '../lib/nativeApp';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { localDate, istTime } from '../lib/time';
import { loadingReference } from '../lib/loadingHistory';

export function OpeningAlerts({ cartId, onOpenStock, compact = false, openTime }) {
  const [opening,setOpening]=useState(null);
  const [checked,setChecked]=useState(false);
  const [alerts,setAlerts]=useState([]),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const read=async()=>{
      if(compact){
        const {data,error}=await supabase.rpc('app_opening_status',{p_cart_id:cartId,p_date:openingBusinessDate(openTime)});
        if(!active)return;
        setChecked(true);setOpening(error?null:{...data,overdue:!!openTime&&Date.now()>=Date.parse(`${openingBusinessDate(openTime)}T${openTime}:00+05:30`)});setError(error?'Opening status unavailable':'');return;
      }
      const {data,error}=await supabase.from('opening_alerts').select('id,kind,title,body,business_date,created_at,read_at').eq('cart_id',cartId).order('created_at',{ascending:false}).limit(20);
      if(!active)return;
      if(error)setError('Opening alerts are unavailable. Retry when connected.');
      else {setAlerts(data || []);setError('');}
    };
    void read();const timer=setInterval(read,20000);window.addEventListener('focus',read);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',read);};
  },[cartId,compact,openTime]);
  const markRead=async id=>{
    const {error}=await supabase.rpc('app_read_opening_alert',{p_id:id});
    if(error){setError('Could not mark this alert as read.');return;}
    nativeCommand('acknowledgePartner',{key:`opening-${id}`});
    setAlerts(items=>items.map(a=>a.id===id?{...a,read_at:new Date().toISOString()}:a));
  };
  if(compact) {
    const completed=opening?.record;
    const missingManager=checked&&!error&&!opening?.managerActive;
    return <button className={`opening-flag ${completed?'complete':missingManager||opening?.overdue?'overdue':''}`} onClick={onOpenStock}>
      <span className="status-dot"/><span style={{flex:1,minWidth:0,textAlign:'left'}}>
        <span style={{display:'block'}}>{error?'Opening status unavailable':!checked?'Checking opening stock…':completed?`Opening stock submitted by ${completed.actor_name || 'manager'}`:missingManager?'Assign a manager for opening stock':opening?.overdue?'Opening stock overdue':'Opening stock pending'}</span>
        {completed&&<span style={{display:'block',fontSize:12,fontWeight:400,lineHeight:1.6,marginTop:4}}>
          <span style={{display:'block'}}>Business date: {completed.business_date}</span>
          {completed.created_at&&<span style={{display:'block'}}>Submitted {localDate(new Date(completed.created_at))} · {istTime(new Date(completed.created_at))} IST</span>}
          <span style={{display:'block',overflowWrap:'anywhere'}}>Ref: {loadingReference(completed)}</span>
          <span style={{display:'block',marginTop:3}}>View loading details →</span>
        </span>}
      </span><span aria-hidden="true">→</span>
    </button>;
  }
  return <section aria-label="Opening alerts" style={{background:'#fff',border:'1px solid #DCE4EC',borderRadius:16,padding:18,marginBottom:20}}>
    <h3 style={{fontSize:17,margin:'0 0 8px'}}>Opening alerts {alerts.some(a=>!a.read_at)&&<span style={{fontSize:12,color:'#B42318'}}>· {alerts.filter(a=>!a.read_at).length} unread</span>}</h3>
    <p style={{fontSize:12,color:'#617184',lineHeight:1.6}}>Daily loading confirmations and missed-opening alerts are saved here across your phones.</p>

    {error && <p role="alert">{error}</p>}
    {!alerts.length && !error && <p style={{fontSize:13,marginTop:10}}>No opening alerts yet.</p>}
    {alerts.length>0 && <details><summary style={{padding:'12px 0',cursor:'pointer',fontWeight:700}}>View recent alerts</summary>{alerts.map(a=><article key={a.id} style={{padding:'12px 0',borderTop:'1px solid #E3E9EF'}}>
      <strong style={{fontSize:14,color:a.kind==='missed'?'#B42318':'#087A65'}}>{a.title}</strong>
      <div style={{fontSize:11,color:'#617184',margin:'5px 0'}}>{a.business_date} · {new Date(a.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</div>
      <p style={{fontSize:13,lineHeight:1.5}}>{a.body}</p>
      {!a.read_at && <button onClick={()=>markRead(a.id)} style={{minHeight:44,marginTop:6,border:'1px solid #CCD6E0',borderRadius:8,background:'#fff',padding:'8px 12px'}}>Mark read</button>}
    </article>)}</details>}
    {onOpenStock && <button onClick={onOpenStock} style={{minHeight:44,marginTop:8,border:0,background:'#0A2F5C',color:'#fff',borderRadius:8,padding:'10px 16px',fontWeight:700}}>View opening stock</button>}
  </section>;
}
