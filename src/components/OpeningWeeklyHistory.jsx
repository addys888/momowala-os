import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {localDate,istTime} from '../lib/time';
import {loadingWeek,shiftDay,loadingReference} from '../lib/loadingHistory';

export function OpeningWeeklyHistory({cartId,stockTypes=[]}) {
 const [anchor,setAnchor]=useState(()=>localDate()),[result,setResult]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const {start,end}=loadingWeek(anchor),scope=`${cartId}:${start}`;
 useEffect(()=>{
  let active=true;
  setError('');
  supabase.from('opening_loads').select('*').eq('cart_id',cartId).gte('business_date',start).lte('business_date',end).order('business_date',{ascending:false}).limit(7).then(({data,error})=>{
   if(!active)return;
   if(error)setError('Could not load this week. Please retry.');
   else setResult({scope,rows:data||[]});
  }).catch(()=>{if(active)setError('Could not load this week. Please retry.');});
  return()=>{active=false;};
 },[cartId,start,end,scope,retry]);
 const rows=result?.scope===scope?result.rows:null;
 return <div style={{marginTop:12}}>
  <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
   <button className="quiet-button" onClick={()=>setAnchor(shiftDay(start,-7))}>Previous week</button>
   <button className="quiet-button" disabled={end>=localDate()} onClick={()=>setAnchor(shiftDay(start,7))}>Next week</button>
   <button className="quiet-button" onClick={()=>setAnchor(localDate())}>This week</button>
   <label>Jump to date <input type="date" aria-label="Loading history week" value={anchor} max={localDate()} onChange={e=>{if(e.target.value)setAnchor(e.target.value);}}/></label>
  </div>
  <p><b>{start} – {end}</b> · IST</p>
  {error?<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:!rows?<p role="status">Loading history…</p>:rows.length===0?<p>No opening loads recorded this week.</p>:rows.map(row=><details key={row.business_date} style={{padding:'12px 0',borderTop:'1px solid #dce3ea'}}>
   <summary style={{cursor:'pointer'}}><b>{row.business_date}</b> · {row.actor_name||'Manager'}<br/><span style={{fontSize:12,overflowWrap:'anywhere'}}>{loadingReference(row)}</span></summary>
   <p>Submitted {localDate(new Date(row.created_at))} at {istTime(new Date(row.created_at))} IST</p>
   {Object.entries(row.quantities||{}).map(([key,qty])=><p key={key}>{stockTypes.find(t=>t.key===key)?.label||key}: <b>{qty} pieces</b></p>)}
  </details>)}
  <p className="muted" style={{fontSize:12}}>Seven business days per page. Older records remain available through Previous week or Jump to date.</p>
 </div>;
}
