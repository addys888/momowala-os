import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { openingBusinessDate, validateOpeningLoad } from '../lib/openingInventory';
import { nativeCommand } from '../lib/nativeApp';
import { useStore } from '../store';
import { StockRefill } from './StockRefill';
import { DailyOpeningModal } from './DailyOpeningModal';
import { OpeningWeeklyHistory } from './OpeningWeeklyHistory';
import { localDate, istTime } from '../lib/time';
import { loadingReference } from '../lib/loadingHistory';

const field={width:'100%',minHeight:44,padding:10,border:'1px solid #CCD6E0',borderRadius:8,fontSize:16};
const button={minHeight:44,padding:'10px 16px',border:0,borderRadius:9,background:'#0A2F5C',color:'#fff',fontWeight:700};
export function OpeningInventory({cartId,cart,stockTypes=[],inventory={},onReady,onManager,staffFlow=false,showDetails=true}) {
  const {session,refreshNow}=useStore();
  const [savedRecord,setRecord]=useState(null), [loadedFor,setLoadedFor]=useState(''), [error,setError]=useState('');
  const [quantities,setQuantities]=useState({}), [busy,setBusy]=useState(false), [native,setNative]=useState(null);
  const retry=useRef(null), saving=useRef(false);
  const [access,setAccess]=useState(null),[review,setReview]=useState(false);
  const [statusError,setStatusError]=useState(''),[attempted,setAttempted]=useState(false),[notice,setNotice]=useState('');
  const validation=validateOpeningLoad(stockTypes,quantities,inventory);
  const [date,setDate]=useState(()=>openingBusinessDate(cart?.openTime));
  const loaded = loadedFor === `${cartId}:${date}`;
  const record = loaded ? savedRecord : null;
  const [historyOpen,setHistoryOpen]=useState(false);
  const ownerHistory=session?.role==='owner'||session?.role==='admin';
  useEffect(()=>{if(staffFlow)return;const timer=setInterval(()=>setDate(openingBusinessDate(cart?.openTime)),30000);return()=>clearInterval(timer);},[cart?.openTime,staffFlow]);
  useEffect(()=>{
    let active=true;
    onReady?.(false);onManager?.(false);
    const read=async()=>{
      try {
        const {data,error}=await supabase.rpc('app_opening_status',{p_cart_id:cartId,p_date:staffFlow ? null : date});
        if(error) throw error;
        if(active){
          if(staffFlow && data.businessDate && data.businessDate!==date){setDate(data.businessDate);return;}
          if(session?.role==='staff' && !data.canLoad) {
            const current=nativeCommand('inventoryStatus');
            if(current?.enabled && current.cartId===cartId)setNative(nativeCommand('clearInventory'));
          }
          onManager?.(session?.role==='staff' && data.canLoad===true);setAccess(data);setRecord(previous=>data.record || (previous?.business_date===date ? previous : null));setLoadedFor(`${cartId}:${date}`);setStatusError('');onReady?.(!!data.record);}
      } catch {if(active){onManager?.(false);setStatusError('Cannot verify today’s loading status. Reconnect; your entered quantities are kept.');}}
    };
    void read(); const timer=setInterval(read,20000);
    const visible=()=>{if(!document.hidden)void read();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
  },[cartId,date,onReady,onManager,session?.role,session?.staffId,staffFlow]);
  useEffect(()=>{
    if(!loaded || !access?.canLoad || session?.role!=='staff' || !cart?.openTime || (record && record.business_date!==date)) return;
    nativeCommand('configureInventory',{cartId,openTime:cart.openTime,expiresAt:session.expiresAt,completedDate:record?.business_date || ''});
  },[loaded,access?.canLoad,record,date,cartId,cart?.openTime,session?.role,session?.expiresAt]);
  useEffect(()=>{
    const read=()=>setNative(nativeCommand('inventoryStatus'));
    const visible=()=>{if(!document.hidden)read();};read();window.addEventListener('focus',read);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{setQuantities({});setReview(false);setAttempted(false);setNotice('');setError('');retry.current=null;},[cartId,date]);
  const save=async()=>{
    if(saving.current || !access?.canLoad || statusError)return;
    setAttempted(true);
    if(validation.error){setError(validation.error);setReview(false);return;}
    const values=validation.values;
    const encoded=date+JSON.stringify(values);
    // Keep an uncertain request's ID stable across network retries; server also enforces one opening load per day.
    if(retry.current?.encoded!==encoded)retry.current={id:crypto.randomUUID(),encoded};
    saving.current=true;setBusy(true);setError('');
    try {
      const {data,error}=await supabase.rpc('app_load_opening_inventory',{p_cart_id:cartId,p_date:date,p_operation_id:retry.current.id,p_quantities:values});
      if(error)throw error;
      if(!data?.record || !['ok','conflict'].includes(data.status))throw new Error(data?.message || 'Save could not be confirmed. Retry to check the saved opening load.');
      if(data.record){setRecord(data.record);setLoadedFor(`${cartId}:${date}`);onReady?.(true);}
      if(data.status!=='ok')setNotice(data.message || 'Opening stock was already saved on another phone.');
      else setNotice('Opening stock saved. Your owner can see the quantities.');
      nativeCommand('configureInventory',{cartId,openTime:cart?.openTime,expiresAt:session?.expiresAt,completedDate:data.record?.business_date || ''});
      try{await refreshNow();}catch{setNotice('Opening stock is saved. Reconnect to refresh the displayed stock.');}
    }catch(e){setError(e.message || 'Could not save. Retry when connected; stock will not be loaded twice.');}
    finally {saving.current=false;setBusy(false);}
  };
  const showModal=staffFlow && loaded && access?.canLoad && !record;
  if(staffFlow && !showModal && !showDetails)return notice?<p role="status" className="partner-card">{notice} <button type="button" className="quiet-button" onClick={()=>setNotice('')}>Dismiss</button></p>:statusError?<p role="alert" className="partner-card">{statusError}</p>:null;
  const content=<section style={{background:'#fff',border:'1px solid #DAE3EC',borderRadius:16,padding:18,marginBottom:16}} aria-label="Opening inventory">
    <div style={{fontSize:10,letterSpacing:1.2,fontWeight:800,color:'#617184'}}>DAILY READINESS · {date}</div>
    <h2 style={{fontSize:20,margin:'8px 0'}}>{record?'Inventory ready':access?.canLoad?'Prepare opening stock':'Opening stock status'}</h2>
    {!record && <p style={{fontSize:13,lineHeight:1.6,color:'#617184',marginBottom:14}}>Enter the fresh pieces loaded from your freezer or kitchen today. Confirm once; your owner receives the saved quantities.</p>}
    <p style={{fontSize:13,lineHeight:1.6,color:'#617184',margin:'10px 0'}}>Manager: <strong>{access?.managerActive ? access.managerName : 'Not assigned or inactive'}</strong> · Opening {cart?.openTime || 'not set'} IST</p>
    {!record && ownerHistory && <details onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>View weekly opening history</summary>{historyOpen&&<OpeningWeeklyHistory cartId={cartId} stockTypes={stockTypes}/>}</details>}
    {!record && loaded && !access?.canLoad && <p style={{fontSize:13,marginBottom:12}}>Only the assigned manager can submit opening stock. {session?.role==='owner'?'Assign or replace the manager in Staff → Registry & activity.':'Ask your owner to check the manager assignment.'}</p>}
    {notice && <p role="status" style={{color:'#087A65',marginBottom:12}}>{notice}</p>}
    {statusError && <p role="alert" style={{color:'#B42318',marginBottom:12}}>{statusError}</p>}
    {error && <p role="alert" style={{color:'#B42318',marginBottom:12}}>{error}</p>}
    {record?.created_at&&<p style={{fontSize:12,color:'#617184'}}>Saved {localDate(new Date(record.created_at))} · {istTime(new Date(record.created_at))} IST</p>}
    {record ? <details onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary style={{color:'#087A65',cursor:'pointer'}}>Opening stock saved by {record.actor_name || 'manager'} · {ownerHistory?'View weekly history':'View quantities'}</summary>{record.created_at&&<p style={{fontSize:13}}>Submitted {localDate(new Date(record.created_at))} at {istTime(new Date(record.created_at))} IST<br/>{loadingReference(record)}</p>}{ownerHistory&&historyOpen&&<OpeningWeeklyHistory cartId={cartId} stockTypes={stockTypes}/>}<p style={{fontSize:13,marginTop:8}}>{Object.entries(record.quantities).map(([key,n])=>`${stockTypes.find(s=>s.key===key)?.label || key}: ${n}`).join(' · ')}</p><p style={{fontSize:12,marginTop:8,color:'#617184'}}>The assigned manager can add refills below. Corrections remain in the owner’s Stock controls.</p></details> : <>
      {!loaded && <p role="status">Checking today’s saved inventory…</p>}
      <fieldset hidden={loaded && !access?.canLoad} disabled={busy || !loaded || !access?.canLoad || !!statusError} style={{border:0,padding:0,margin:0,minWidth:0}}>
        {stockTypes.map(s=><label key={s.key} style={{display:'block',marginBottom:12,fontSize:13,fontWeight:650}}>{s.label} <span style={{fontWeight:400,color:'#617184'}}>· freezer: {inventory[s.key]?.freezer || 0}</span><input aria-label={`Load ${s.label}`} aria-invalid={attempted&&!!validation.errors[s.key]} aria-describedby={attempted&&validation.errors[s.key]?`opening-error-${s.key}`:undefined} readOnly={review} type="number" inputMode="numeric" min="0" max={Math.min(100000,inventory[s.key]?.freezer||0)} step="1" style={{...field,marginTop:5,borderColor:attempted&&validation.errors[s.key]?'#B42318':'#CCD6E0'}} value={quantities[s.key] ?? ''} placeholder="Enter pieces (0 for none)" onChange={e=>{setReview(false);setQuantities({...quantities,[s.key]:e.target.value});}}/>{attempted&&validation.errors[s.key]&&<span id={`opening-error-${s.key}`} style={{display:'block',color:'#B42318',fontSize:12,marginTop:5}}>{validation.errors[s.key]}</span>}</label>)}
        {!review&&<button style={{...button,width:'100%'}} disabled={!stockTypes.length} onClick={()=>{setAttempted(true);if(validation.error){setError(validation.error);return;}setReview(true);setError('');}}>Review {validation.total>0?`${validation.total} pieces`:'opening stock'}</button>}
      </fieldset>
      {review && access?.canLoad && <div aria-label="Confirm opening stock" style={{background:'#F1F5F9',borderRadius:12,padding:16,marginTop:16}}>
        <strong>Confirm {validation.total} pieces for today</strong>
        <p style={{fontSize:13,lineHeight:1.6,margin:'10px 0'}}>{stockTypes.map(s=>`${s.label}: ${Number(quantities[s.key]||0)} pieces`).join(' · ')}</p>
        <p style={{fontSize:12,lineHeight:1.6,marginBottom:12}}>This transfers freezer stock once and creates the owner’s loading confirmation. An internet connection is required.</p>
        <button style={button} disabled={busy||!!statusError||!!validation.error} onClick={save}>{busy?'Confirming…':'Confirm daily load'}</button>
        <button style={{...button,marginLeft:8,background:'#fff',color:'#0A2F5C'}} disabled={busy} onClick={()=>setReview(false)}>Edit</button>
      </div>}
    </>}
    {record && loaded && access?.canLoad && session?.role==='staff' && <StockRefill key={`${cartId}:${date}`} cartId={cartId} date={date} stockTypes={stockTypes} inventory={inventory}/> }
    {__ANDROID_APP__ && native && access?.canLoad && session?.role==='staff' && (!native.enabled || !native.notifications || !native.exact || native.cartId!==cartId) && <details style={{borderTop:'1px solid #E3E9EF',marginTop:18,paddingTop:14,fontSize:13}}>
      <summary style={{cursor:'pointer',fontWeight:650}}>Set up opening reminders</summary>
      <p style={{lineHeight:1.6,margin:'7px 0 10px',color:'#617184'}}>Rings and vibrates until acknowledged or opening stock is saved. Acknowledgment silences today’s reminder without marking stock ready. Android sound, notification and battery settings still apply. Alarms continue after logout until you unassign this phone. Sign in to save inventory. Force-stopping the app prevents reminders. Changes from another phone are checked while this screen is open.</p>
      {!native?.enabled && <button style={button} disabled={!cart?.openTime || !loaded} onClick={()=>{ nativeCommand('configureInventory',{cartId,openTime:cart.openTime,expiresAt:session.expiresAt,completedDate:record?.business_date || ''}); setNative(nativeCommand('enableInventory')); }}>Enable on this phone</button>}
      {native?.enabled && native.cartId!==cartId && <p role="alert">This phone is assigned to another cart. Unassign it before enabling this cart’s reminders.</p>}
      {native?.enabled && <button style={{...button,background:'#fff',color:'#B42318',border:'1px solid #D7DFE8',marginTop:8}} onClick={()=>{if(confirm('Stop opening alarms and unassign this phone?')) setNative(nativeCommand('clearInventory'));}}>Unassign this phone</button>}
      {native?.enabled && !native.notifications && <button style={button} onClick={()=>nativeCommand('notificationSettings')}>Allow notifications in settings</button>}
      {native?.enabled && native.notifications && !native.exact && <button style={button} onClick={()=>nativeCommand('alarmSettings')}>Allow precise alarms</button>}
      {native?.enabled && native.cartId===cartId && native.notifications && native.exact && <p style={{color:'#087A65'}}>Opening reminders are enabled. Check alarm volume and vibration in Android settings.</p>}
    </details>}
  </section>;
  return showModal ? <DailyOpeningModal>{content}</DailyOpeningModal> : content;
}
