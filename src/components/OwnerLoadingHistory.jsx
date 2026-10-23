import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {localDate,istTime} from '../lib/time';

export function OwnerLoadingHistory({cartId,stockTypes=[]}) {
 const [date,setDate]=useState(()=>localDate()),[data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true,inFlight=false;
  const read=async()=>{
   if(inFlight)return;
   inFlight=true;
   try{
    const [opening,transfers]=await Promise.all([
     supabase.from('opening_loads').select('business_date,actor_name,quantities,created_at').eq('cart_id',cartId).eq('business_date',date).maybeSingle(),
     supabase.from('cart_loadings').select('id,date,time,type,item,qty,note').eq('cart_id',cartId).eq('date',date).eq('type','CART_LOAD').order('id',{ascending:true}),
    ]);
    if(opening.error||transfers.error)throw opening.error||transfers.error;
    if(active){setData({cartId,date,opening:opening.data,transfers:transfers.data||[]});setError('');}
   }catch{if(active)setError('Loading history is unavailable. Please retry.');}
   finally{inFlight=false;}
  };
  void read();const focus=()=>{if(!document.hidden)void read();};const timer=setInterval(focus,20000);window.addEventListener('focus',focus);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
 },[cartId,date,retry]);
 const current=data?.cartId===cartId&&data?.date===date?data:null;
 const opening=current?.opening;
 const refills=(current?.transfers||[]).filter(row=>row.note!=='Opening stock transfer');
 const keys=[...new Set([...stockTypes.map(t=>t.key),...Object.keys(opening?.quantities||{}),...refills.map(r=>r.item)])];
 const today=localDate();const yesterday=localDate(new Date(Date.now()-86400000));
 return <section className="partner-card" aria-label="Daily loading history">
  <h2 style={{fontSize:20,margin:'0 0 8px'}}>Daily loading history</h2>
  <p className="muted">Stock loaded into the cart, separate from current remaining stock.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',margin:'12px 0'}}>
   <button className="quiet-button" aria-pressed={date===today} onClick={()=>setDate(today)}>Today</button>
   <button className="quiet-button" aria-pressed={date===yesterday} onClick={()=>setDate(yesterday)}>Yesterday</button>
   <label>Business date <input aria-label="Loading business date" type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} style={{minHeight:44,maxWidth:'100%'}}/></label>
  </div>
  {error&&<p role="alert">{error} <button className="quiet-button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  {!current&&!error&&<p role="status">Loading saved records…</p>}
  {current&&<>
   <strong>{date} · {opening?'Opening stock submitted':'No opening load recorded'}</strong>
   {opening&&<p style={{fontSize:13}}>Submitted by <b>{opening.actor_name||'Manager'}</b> on {localDate(new Date(opening.created_at))} at {istTime(new Date(opening.created_at))} IST</p>}
   {(opening||refills.length>0)&&<div style={{overflowX:'auto',marginTop:12}}><table style={{width:'100%',textAlign:'left',fontSize:14}}><caption style={{textAlign:'left',paddingBottom:8}}>Pieces loaded by category</caption><thead><tr><th>Category</th><th>Opening</th><th>Refills</th><th>Total loaded</th></tr></thead><tbody>{keys.map(key=>{
    const initial=Number(opening?.quantities[key]||0),extra=refills.filter(r=>r.item===key).reduce((sum,r)=>sum+Number(r.qty||0),0);
    return <tr key={key}><th style={{padding:'10px 0'}}>{stockTypes.find(t=>t.key===key)?.label||key}</th><td>{initial}</td><td>{extra}</td><td><b>{initial+extra}</b></td></tr>;
   })}</tbody></table></div>}
   {refills.length>0&&<details style={{marginTop:12}}><summary>Refill entries · {refills.length}</summary>{refills.map(row=><p key={row.id} style={{fontSize:13}}>{row.time} IST · {stockTypes.find(t=>t.key===row.item)?.label||row.item}: +{row.qty} · {row.note}</p>)}</details>}
   <p className="muted" style={{fontSize:12,marginTop:12}}>Business date and submission time are shown separately. A load submitted after midnight may belong to the next business date. Returns and stock corrections are listed in Activity Log below.</p>
  </>}
 </section>;
}
