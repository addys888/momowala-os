import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { openingBusinessDate } from '../lib/openingInventory';

export function OpeningManager({ cartId, cart, staff, onAssignment }) {
  const [status,setStatus]=useState(null), [selected,setSelected]=useState(''), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  const read=async()=>{
    const {data,error}=await supabase.rpc('app_opening_status',{p_cart_id:cartId,p_date:openingBusinessDate(cart?.openTime)});
    if(error)throw error;
    onAssignment?.(data.managerActive ? data.managerId : null);setStatus(data);setSelected(data.managerId ? String(data.managerId) : '');
  };
  useEffect(()=>{let active=true;supabase.rpc('app_opening_status',{p_cart_id:cartId,p_date:openingBusinessDate(cart?.openTime)}).then(({data,error})=>{
    if(!active)return;
    if(error)setMessage('Unable to read manager assignment. Retry when connected.');
    else {onAssignment?.(data.managerActive ? data.managerId : null);setStatus(data);setSelected(data.managerId ? String(data.managerId) : '');}
  });return()=>{active=false;};},[cartId,cart?.openTime,onAssignment]);
  const save=async()=>{
    setBusy(true);setMessage('');
    try {
      const {data,error}=await supabase.rpc('app_assign_opening_manager',{p_cart_id:cartId,p_staff_id:selected ? Number(selected) : null,p_revision:status.revision});
      if(error)throw error;
      await read();setMessage(data.status==='ok'?'Manager assignment saved.':data.message);
    }catch(e){setMessage(e.message || 'Could not save. Retry when connected.');}
    finally{setBusy(false);}
  };
  return <section aria-label="Opening manager" style={{padding:18,background:'#fff',border:'1px solid #DCE4EC',borderRadius:14,marginBottom:18}}>
    <div style={{fontSize:11,fontWeight:800,letterSpacing:1,color:'#617184'}}>DAILY OPERATIONS · ACCOUNTABILITY</div>
    <h3 style={{margin:'8px 0'}}>Cart manager</h3>
    <p style={{fontSize:13,lineHeight:1.6,color:'#617184'}}>One active staff member is responsible for opening stock and closing counts. Other staff can serve orders, but cannot submit these manager reports.</p>
    {status && <p style={{fontSize:13,margin:'12px 0',color:status.managerActive?'#087A65':'#B42318'}}>{status.managerActive ? `Assigned: ${status.managerName}` : 'Action needed: assign an active manager.'}</p>}
    <label style={{display:'block',fontSize:13,fontWeight:700}}>Responsible manager
      <select aria-label="Responsible manager" value={selected} disabled={busy || !status} onChange={e=>setSelected(e.target.value)} style={{display:'block',width:'100%',minHeight:46,padding:10,marginTop:8,border:'1px solid #CCD6E0',borderRadius:8,background:'#fff',fontSize:16}}>
        <option value="">No manager assigned</option>
        {staff.filter(s=>s.active || String(s.id)===selected).map(s=><option key={s.id} value={s.id} disabled={!s.active}>{s.name}{!s.active?' (disabled)':''}</option>)}
      </select>
    </label>
    <p style={{fontSize:12,lineHeight:1.7,color:'#617184',margin:'12px 0'}}>Manager reminder: 30 minutes before opening.<br/>Owner escalation: at {cart?.openTime || 'opening time'} IST if stock is missing.<br/>A successful load creates an owner confirmation with the manager’s name and quantities. Configure the closing time in Reconcile → Daily closing.</p>
    <button disabled={busy || !status || selected===(status.managerId ? String(status.managerId) : '')} onClick={save} style={{minHeight:44,padding:'10px 16px',background:'#0A2F5C',color:'#fff',border:0,borderRadius:8,fontWeight:700}}>{busy?'Saving…':'Save manager'}</button>
    {message && <p role="status" style={{fontSize:13,marginTop:10}}>{message}</p>}
    {!status && <button onClick={()=>read().catch(()=>setMessage('Unable to connect. Try again.'))}>Retry</button>}
  </section>;
}
