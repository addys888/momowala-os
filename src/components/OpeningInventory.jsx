import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { openingBusinessDate } from '../lib/openingInventory';
import { nativeCommand } from '../lib/nativeApp';
import { useStore } from '../store';

const field={width:'100%',minHeight:44,padding:10,border:'1px solid #CCD6E0',borderRadius:8,fontSize:16};
const button={minHeight:44,padding:'10px 16px',border:0,borderRadius:9,background:'#0A2F5C',color:'#fff',fontWeight:700};
export function OpeningInventory({cartId,cart,stockTypes=[],inventory={},onReady}) {
  const {session,refreshNow}=useStore();
  const [record,setRecord]=useState(null), [loaded,setLoaded]=useState(false), [error,setError]=useState('');
  const [quantities,setQuantities]=useState({}), [busy,setBusy]=useState(false), [native,setNative]=useState(null);
  const retry=useRef(null), saving=useRef(false);
  const [date,setDate]=useState(()=>openingBusinessDate(cart?.openTime));
  useEffect(()=>{const timer=setInterval(()=>setDate(openingBusinessDate(cart?.openTime)),30000);return()=>clearInterval(timer);},[cart?.openTime]);
  useEffect(()=>{
    let active=true;
    const read=async()=>{
      try {
        const {data,error}=await supabase.from('opening_loads').select('*').eq('cart_id',cartId).eq('business_date',date).maybeSingle();
        if(error) throw error;
        if(active){setRecord(data);setLoaded(true);setError('');onReady?.(!!data);}
      } catch {if(active)setError('Opening stock status is unavailable. Check your connection and try again.');}
    };
    void read(); const timer=setInterval(read,20000);
    return()=>{active=false;clearInterval(timer);};
  },[cartId,date,onReady]);
  useEffect(()=>{
    if(!loaded || session?.role!=='staff' || !cart?.openTime) return;
    nativeCommand('configureInventory',{cartId,openTime:cart.openTime,expiresAt:session.expiresAt,completedDate:record?.business_date || ''});
  },[loaded,record,cartId,cart?.openTime,session?.role,session?.expiresAt]);
  useEffect(()=>{
    const read=()=>setNative(nativeCommand('inventoryStatus'));
    read();window.addEventListener('focus',read);return()=>window.removeEventListener('focus',read);
  },[]);
  const save=async()=>{
    if(saving.current)return;
    const values=Object.fromEntries(stockTypes.map(s=>[s.key,Number(quantities[s.key] || 0)]).filter(([,n])=>n!==0));
    if(!Object.keys(values).length || Object.values(values).some(n=>!Number.isSafeInteger(n)||n<0)){setError('Enter positive whole-piece quantities for the stock being loaded.');return;}
    const encoded=date+JSON.stringify(values);
    // Keep an uncertain request's ID stable across network retries; server also enforces one opening load per day.
    if(retry.current?.encoded!==encoded)retry.current={id:crypto.randomUUID(),encoded};
    saving.current=true;setBusy(true);setError('');
    try {
      const {data,error}=await supabase.rpc('app_load_opening_inventory',{p_cart_id:cartId,p_date:date,p_operation_id:retry.current.id,p_quantities:values});
      if(error)throw error;
      if(data.record){setRecord(data.record);setLoaded(true);onReady?.(true);}
      if(data.status!=='ok')setError(data.message);
      await refreshNow();
    }catch(e){setError(e.message || 'Could not save. Retry when connected; stock will not be loaded twice.');}
    finally {saving.current=false;setBusy(false);}
  };
  return <section style={{background:'#fff',border:'1px solid #DAE3EC',borderRadius:16,padding:18,marginBottom:16}} aria-label="Opening inventory">
    <div style={{fontSize:10,letterSpacing:1.2,fontWeight:800,color:'#617184'}}>DAILY READINESS · {date}</div>
    <h2 style={{fontSize:20,margin:'8px 0'}}>{record?'Inventory ready':'Load opening stock'}</h2>
    {!record && <p style={{fontSize:13,lineHeight:1.6,color:'#617184',marginBottom:14}}>Transfer today’s pieces from the freezer or kitchen stock to this cart. Saved quantities stop this phone’s opening reminder.</p>}
    {error && <p role="alert" style={{color:'#B42318',marginBottom:12}}>{error}</p>}
    {record ? <details><summary style={{color:'#087A65',cursor:'pointer'}}>Opening stock saved · View quantities</summary><p style={{fontSize:13,marginTop:8}}>{Object.entries(record.quantities).map(([key,n])=>`${stockTypes.find(s=>s.key===key)?.label || key}: ${n}`).join(' · ')}</p><p style={{fontSize:12,marginTop:8,color:'#617184'}}>For later top-ups or corrections, use the owner’s Stock controls.</p></details> : <>
      {!loaded && <p role="status">Checking today’s saved inventory…</p>}
      <fieldset disabled={busy || !loaded} style={{border:0,padding:0,margin:0,minWidth:0}}>
        {stockTypes.map(s=><label key={s.key} style={{display:'block',marginBottom:12,fontSize:13,fontWeight:650}}>{s.label} <span style={{fontWeight:400,color:'#617184'}}>· freezer: {inventory[s.key]?.freezer || 0}</span><input aria-label={`Load ${s.label}`} type="number" inputMode="numeric" min="0" step="1" style={{...field,marginTop:5}} value={quantities[s.key] ?? ''} placeholder="Pieces to load" onChange={e=>setQuantities({...quantities,[s.key]:e.target.value})}/></label>)}
        <button style={button} disabled={!stockTypes.length} onClick={save}>{busy?'Saving stock…':'Save opening stock'}</button>
      </fieldset>
    </>}
    {__ANDROID_APP__ && session?.role==='staff' && <div style={{borderTop:'1px solid #E3E9EF',marginTop:18,paddingTop:14,fontSize:13}}>
      <strong>Opening alarm · 30 minutes before {cart?.openTime || 'opening'}</strong>
      <p style={{lineHeight:1.6,margin:'7px 0 10px',color:'#617184'}}>Rings and vibrates until opening stock is saved. Android sound, notification and battery settings still apply. Keep this staff account signed in. Force-stopping the app prevents reminders. Changes from another phone are checked while this screen is open.</p>
      {!native?.enabled && <button style={button} disabled={!cart?.openTime || !loaded} onClick={()=>setNative(nativeCommand('enableInventory'))}>Enable on this phone</button>}
      {native?.enabled && !native.notifications && <button style={button} onClick={()=>nativeCommand('notificationSettings')}>Allow notifications in settings</button>}
      {native?.enabled && native.notifications && !native.exact && <button style={button} onClick={()=>nativeCommand('alarmSettings')}>Allow precise alarms</button>}
      {native?.enabled && native.notifications && native.exact && <p style={{color:'#087A65'}}>Opening reminders are enabled. Check alarm volume and vibration in Android settings.</p>}
    </div>}
  </section>;
}
