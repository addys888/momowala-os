import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { closingVariance } from '../lib/closingVariance';
import { nativeCommand } from '../lib/nativeApp';

async function rpc(name, args) {
 const {data,error}=await supabase.rpc(name,args); if(error)throw error; return data;
}
export function ClosingWorkflow({cartId,owner=false,expanded=false,onOpen}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [cash,setCash]=useState(''),[counts,setCounts]=useState({}),[notes,setNotes]=useState('');
 const [editing,setEditing]=useState(false),[enabled,setEnabled]=useState(false),[time,setTime]=useState('22:00');
 const [expected,setExpected]=useState(null);
 const settingsRevision=useRef(0);
 const [review,setReview]=useState(false); const request=useRef(null),epoch=useRef(0);
 const load=useCallback(async()=>{
  const version=++epoch.current;
  try {
   const next=await rpc('app_closing_status',{p_cart_id:cartId});
   if(version!==epoch.current)return;
   next.settings={...next.settings,enabled:next.settings?.enabled===true,closing_time:next.settings?.closing_time||'22:00:00',revision:next.settings?.revision??0};
   setData(next);setError('');
   // Only confirmed server state controls which native closing alerts may ring.
   const alerts=next.reports.filter(r=>owner?r.submitted_at&&!r.owner_read_at:next.settings.enabled&&next.canSubmit&&!r.submitted_at)
    .map(r=>({key:owner?`closing-owner-${r.id}`:`closing-manager-${r.id}-${next.managerRevision}-${next.settings.revision}`,title:owner?'Closing report ready':'Submit closing counts',body:owner?`${r.submitted_name} submitted ${r.business_date}. Review in Reconcile.`:`${r.business_date}: count cash and remaining stock. Submit to stop ringing.`}));
   // Explicitly clear completed alerts even if an older app lost their cart mapping.
   for(const r of next.reports) {
    if(r.owner_read_at)nativeCommand('acknowledgePartner',{key:`closing-owner-${r.id}`});
    if(r.submitted_at)nativeCommand('acknowledgePartner',{key:`closing-manager-${r.id}-${next.managerRevision}-${next.settings.revision}`});
   }
   nativeCommand('syncClosingAlerts',{cartId,alerts});
  } catch(e) {
   if(version!==epoch.current)return;
   if(e.code==='42501'&&!owner){setData(null);nativeCommand('syncClosingAlerts',{cartId,alerts:[]});}
   else setError(e.message||'Could not load closing status.');
  }
 },[cartId,owner]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},15000);window.addEventListener('online',load);return()=>{epoch.current++;clearInterval(timer);window.removeEventListener('online',load);};},[load]);
 const pending=data?.reports.find(r=>!r.submitted_at);
 useEffect(()=>{setCash('');setCounts({});setNotes('');setReview(false);request.current=null;},[pending?.id]);
 const saveSettings=async()=>{
  setBusy(true);setError('');try{await rpc('app_save_closing_settings',{p_cart_id:cartId,p_enabled:enabled,p_time:time,p_revision:settingsRevision.current});setEditing(false);await load();}catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const reviewCounts=async()=>{
  setBusy(true);setError('');setReview(false);
  try{setExpected(await rpc('app_closing_stock_check',{p_cart_id:cartId,p_report_id:pending.id}));setReview(true);}catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const submit=async()=>{
  setBusy(true);setError('');
  const quantities=Object.fromEntries((pending.stock_types||[]).map(t=>[t.key,Number(counts[t.key])]));
  const payload={p_cart_id:cartId,p_report_id:pending.id,p_cash:Number(cash),p_quantities:quantities,p_expected:expected,p_notes:notes};
  const signature=JSON.stringify(payload);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  try{const saved=await rpc('app_submit_closing_checked',{...payload,p_operation_id:request.current.id});setData(v=>({...v,reports:v.reports.map(r=>r.id===saved.id?saved:r)}));nativeCommand('acknowledgePartner',{key:`closing-manager-${saved.id}-${data.managerRevision}-${data.settings.revision}`});setReview(false);await load();}catch(e){setError(e.message);}finally{setBusy(false);}
 };
 const ack=async id=>{setBusy(true);try{await rpc('app_ack_closing',{p_cart_id:cartId,p_report_id:id});nativeCommand('acknowledgePartner',{key:`closing-owner-${id}`});await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 if(!owner&&!data)return error?<p role="alert">Closing status unavailable. <button onClick={load}>Retry</button></p>:null;
 if(!data)return <p role="status">{error||'Loading closing status…'} {error&&<button onClick={load}>Retry</button>}</p>;
 if(!owner&&!data.settings.enabled)return null;
 const unread=data.reports.filter(r=>r.submitted_at&&!r.owner_read_at);
 if(owner&&!expanded)return unread.length?<button className="opening-flag overdue" onClick={onOpen}>{unread.length} closing report{unread.length>1?'s':''} awaiting review →</button>:null;
 const differences=pending&&expected?closingVariance(pending.stock_types||[],counts,expected):[];
 const valid=cash!==''&&Number.isFinite(Number(cash))&&Number(cash)>=0&&(pending?.stock_types||[]).every(t=>counts[t.key]!==undefined&&counts[t.key]!==''&&Number.isInteger(Number(counts[t.key]))&&Number(counts[t.key])>=0);
 return <section className="partner-card closing-workflow" aria-label="Daily closing">
  <h3>Daily closing</h3>
  {__ANDROID_APP__ && (pending||unread.length>0) && <div><button type="button" className="quiet-button" onClick={()=>{for(const r of data.reports.filter(r=>owner?r.submitted_at&&!r.owner_read_at:!r.submitted_at))nativeCommand('acknowledgePartner',{key:owner?`closing-owner-${r.id}`:`closing-manager-${r.id}-${data.managerRevision}-${data.settings.revision}`});}}>Silence ringtone</button><p className="muted">Stops sound and vibration on this phone. Your closing report still needs {owner?'review':'submission'}.</p></div>}
  <p>{data.settings.enabled?`Scheduled at ${data.settings.closing_time.slice(0,5)} IST`:'Closing workflow is off'}</p>
  {error&&<p role="alert">{error} <button disabled={busy} onClick={load}>Reload</button></p>}
  {owner&&<><button className="quiet-button" onClick={()=>{settingsRevision.current=data.settings.revision;setEnabled(data.settings.enabled);setTime(data.settings.closing_time.slice(0,5));setEditing(!editing);}}>Configure closing</button>
   {editing&&<div><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable manager closing</label><label>Closing time (IST)<input aria-label="Closing time" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><p>Uses the cart manager assigned in Staff. Changes apply to future closing tasks; existing reports are retained.</p><button disabled={busy||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)} onClick={saveSettings}>{busy?'Saving…':'Save closing settings'}</button></div>}
  </>}
  {!owner&&pending&&<form key={pending.id} onSubmit={e=>{e.preventDefault();void reviewCounts();}}>
   <p><strong>Closing date: {pending.business_date}</strong></p>
   <label>Cash counted (₹)<input aria-label="Closing cash count" type="number" min="0" max="10000000" step="0.01" required value={cash} disabled={busy} onChange={e=>setCash(e.target.value)}/></label>
   {(pending.stock_types||[]).map(t=><label key={t.key}>{t.label} · pieces remaining<input aria-label={`Closing ${t.label}`} type="number" min="0" max="100000" step="1" required disabled={busy} value={counts[t.key]??''} onChange={e=>{setReview(false);setCounts(v=>({...v,[t.key]:e.target.value}));}}/></label>)}
   <label>Handover notes (optional)<textarea maxLength={1000} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)}/></label>
   <p>Enter physical counts, including zero. Submission stops the alert automatically. You can also silence this phone above while you finish counting.</p>
   {!review?<button disabled={busy||!valid}>Review closing</button>:<div role="group" aria-label="Confirm closing">{differences.length>0&&<div role="alert" style={{background:'#FFF4DC',padding:14,borderRadius:10}}><strong>Stock difference — recount or check missing entries</strong>{differences.map(t=><p key={t.key}><b>{t.label}: count needs review</b> · Recount physically and check unlogged orders, wastage or refills.</p>)}<p>Recount, or check for an unlogged order, wastage or refill. Correct the entry and review again. If the difference remains, explain it in Handover notes before submitting.</p></div>}<p>Submit ₹{cash} cash and {Object.values(counts).reduce((a,b)=>a+Number(b),0)} remaining pieces? The saved report cannot be replaced.</p><button type="button" disabled={busy||!valid||(differences.length>0&&!notes.trim())} onClick={submit}>{busy?'Submitting…':'Submit closing report'}</button><button type="button" disabled={busy} onClick={()=>setReview(false)}>Edit counts</button></div>}
  </form>}
  {!owner&&!pending&&<p>No closing submission due. Your report will appear here at the scheduled time.</p>}
  <details open={owner&&unread.length>0}><summary>Saved manager reports · {data.reports.filter(r=>r.submitted_at).length}</summary>
   {data.reports.filter(r=>r.submitted_at).map(r=><article key={r.id} className="stock-item" style={{display:'block'}}><strong>{r.business_date} · {r.submitted_name}</strong><p>Cash counted: ₹{r.cash_count}</p><p>{r.stock_types.map(t=>`${t.label}: ${r.quantities[t.key]}`).join(' · ')}</p>{owner&&r.expected_quantities&&closingVariance(r.stock_types,r.quantities,r.expected_quantities).map(t=><p key={t.key}>{t.label}: system {t.expected}, counted {t.actual} — {Math.abs(t.difference)} {t.difference<0?'missing':'extra'}</p>)}{r.notes&&<p>{r.notes}</p>}<p>Submitted {new Date(r.submitted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p>{owner&&!r.owner_read_at&&<button disabled={busy} onClick={()=>ack(r.id)}>Acknowledge report</button>}</article>)}
  </details>
  {owner&&<p className="muted">Manager counts are handover evidence. Review them when reconciling; sales and stock balances are not overwritten.</p>}
 </section>;
}
