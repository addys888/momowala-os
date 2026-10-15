import { reconciliationRow } from '../lib/operations.js';
import { useState } from 'react';
import { savedReconciliations, restoreReconciliation } from '../lib/store';
import { useStore } from '../store';
const action={padding:'11px 14px',minHeight:44,border:0,borderRadius:9,background:'#0A2F5C',color:'white',fontWeight:700};
export function ReconciliationRecovery({cartId}) {
  const {refreshSavedData}=useStore();
  const [busy,setBusy]=useState(null),[notice,setNotice]=useState(''),[restored,setRestored]=useState([]),[review,setReview]=useState(null);
  const backups=savedReconciliations(cartId);
  const [chosenDate,setChosenDate]=useState('');
  const dates=[...new Set(backups.map(op=>reconciliationRow(op).date))].sort().reverse();
  const selectedDate=dates.includes(chosenDate)?chosenDate:dates[0];
  const versions=backups.filter(op=>reconciliationRow(op).date===selectedDate);
  async function restore(op) {
    setReview(null);
    setBusy(op.id);setNotice('');
    try { await restoreReconciliation(op.id,cartId);setRestored(items=>[...items,op.id]);await refreshSavedData();setNotice('Report synced successfully. Its recovery copy is retained.'); }
    catch(e){setNotice(e.message || 'Could not restore. The backup is retained.');}
    finally{setBusy(null);}
  }
  return <details style={{border:'1px solid #DCE3EC',background:'#fff',borderRadius:12,padding:16,marginBottom:18}}>
    <summary style={{fontWeight:750,cursor:'pointer'}}>Recovery backups {backups.length>0?`· ${dates.length} day(s)`:''}</summary>
    <p style={{fontSize:13,lineHeight:1.6,color:'#52677C'}}>These are reports set aside by “Reload saved data” on this device. Review the date and figures, then restore. Existing reports are never silently replaced.</p>
    {!backups.length && <p>No matching reconciliation backups were found for this owner on this device. Check the phone where the figures were entered.</p>}
    {dates.length>0&&<label style={{display:'block',margin:'12px 0'}}>Backup date <select aria-label="Recovery backup date" value={selectedDate} onChange={e=>{setChosenDate(e.target.value);setReview(null);}} style={{padding:8,marginLeft:8}}>{dates.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
    {versions.length>1&&<p style={{fontSize:12,color:'#52677C'}}>There are {versions.length} saved versions for this date. Compare the figures before restoring one.</p>}
    {versions.map((op,index)=>{const row=reconciliationRow(op);return <article key={op.id} style={{padding:'14px 0',borderTop:'1px solid #DCE3EC'}}>
      <strong>{versions.length>1?`Version ${index+1} · `:''}{row.date}{row.holiday?' · Closed day':''}</strong>
      <p style={{fontSize:14}}>Cash ₹{row.physical_cash ?? 0} · UPI ₹{row.phonepe_amount ?? 0} · Revenue ₹{row.revenue ?? 0}</p>
      <details><summary>Stock counts and original error</summary><ul>{(Array.isArray(row.stock)?row.stock:[]).map((s,i)=><li key={i}>{s.label || s.key}: {s.actual ?? '—'}</li>)}</ul><p style={{fontSize:12}}>{op.error || 'Saved recovery copy'}</p></details>
      <button style={{...action,marginTop:12}} disabled={busy!==null || restored.includes(op.id)} onClick={()=>setReview(op.id)}>{restored.includes(op.id)?'Synced':busy===op.id?'Restoring…':'Restore this report'}</button>
      {review===op.id && <div style={{background:'#FFF3CD',padding:12,marginTop:10,borderRadius:8}} role="group" aria-label="Confirm report recovery">
        <p>Restore these figures for <strong>{versions.length>1?`Version ${index+1} · `:''}{row.date}</strong>? Cash ₹{row.physical_cash ?? 0} and UPI ₹{row.phonepe_amount ?? 0} will be submitted to your cart’s account.</p>
        <button style={action} disabled={busy!==null} onClick={()=>restore(op)}>Confirm restore</button>
        <button style={{...action,marginLeft:8,background:'#fff',color:'#0A2F5C'}} onClick={()=>setReview(null)}>Cancel</button>
      </div>}
    </article>;})}
    {notice && <p role="status" style={{fontSize:13,lineHeight:1.6}}>{notice}</p>}
  </details>;
}
