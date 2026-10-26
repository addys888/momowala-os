import React, { useState, useEffect, useRef } from 'react';
import { PackageCheck, ChevronDown, Check } from 'lucide-react';
import { readPacking, writePacking } from '../lib/packing';
import { storage, pushMenus } from '../lib/store';
import { TODAY, colors, brand, editInput, prepChecklistFor, menuFor } from '../core';
import { EditModalShell } from './shared';

// Staff can inspect confirmed progress; only owners can save or edit the list.
export function PrepChecklist({ state, updateState, cartId, readOnly=false }) {
  const items=prepChecklistFor(state,cartId),dateKey=`mw:prep:${cartId}:${TODAY}`;
  const [checked,setChecked]=useState(new Set()),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [legacy,setLegacy]=useState(()=>readOnly?[]:storage.get(dateKey,[]));
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(false);
  const busyRef=useRef(false),epoch=useRef(0);
  useEffect(()=>{
    let alive=true;setReady(false);setChecked(new Set());
    const refresh=async()=>{
      if(busyRef.current||document.hidden)return;
      const started=epoch.current;
      try{const next=await readPacking(cartId,TODAY);if(alive&&started===epoch.current){setChecked(next);setReady(true);setError('');}}
      catch{if(alive)setError('Packing status unavailable. Reconnect to load saved progress.');}
    };
    void refresh();const timer=setInterval(refresh,12000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[cartId]);
  const persist=async(changes,importOnly=false)=>{
    if(readOnly||!ready||busyRef.current)return;
    busyRef.current=true;epoch.current++;setBusy(true);setError('');
    try{const next=await writePacking(cartId,TODAY,changes,importOnly);setChecked(next);if(importOnly){storage.set(dateKey,[]);setLegacy([]);}}
    catch{setError('Could not confirm saving. Reconnect and retry; saved server progress is kept.');}
    finally{busyRef.current=false;setBusy(false);}
  };
  const done=items.filter(i=>checked.has(i.id)).length,all=ready&&done===items.length&&items.length>0;
  const pct=items.length?Math.round(done/items.length*100):0;
  return <section className={`packing-card ${all?'complete':''}`} aria-label={readOnly?'Pack today — view only':'Pack today'}>
    <button className="packing-summary" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className="packing-symbol"><PackageCheck size={22}/></span>
      <span className="packing-heading"><strong>{all?'Packed ✓':'Pack today'}</strong><span>{readOnly?'Owner’s packing checklist · View only':'Daily packing checklist'}</span></span>
      <span className="packing-count">{ready?`${done}/${items.length}`:'—'}</span>
      <ChevronDown size={18} style={{transform:open?'rotate(180deg)':'none'}}/>
    </button>
    <div className="packing-progress" role="progressbar" aria-label="Packing completion" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={ready?done:undefined}><span style={{width:ready?`${pct}%`:'0%'}}/></div>
    {error&&<p className="packing-message" role="alert">{error}</p>}
    {open&&<div className="packing-details">
      {!items.length&&<p className="packing-message">{readOnly?'The owner has not set up a packing list.':'Add the items your team needs to pack each day.'}</p>}
      <ul className="packing-list">{items.map(it=>{
        const packed=ready&&checked.has(it.id);
        const content=<><span className={`packing-check ${packed?'checked':''}`} aria-hidden="true">{packed&&<Check size={15}/>}</span><span className="packing-item-name">{it.label}</span><span className="packing-item-status">{!ready?'—':packed?'Packed':'Pending'}</span></>;
        return <li key={it.id}>{readOnly?<div className="packing-item">{content}</div>:<button className="packing-item" aria-pressed={packed} disabled={!ready||busy} onClick={()=>persist({[it.id]:!checked.has(it.id)})}>{content}</button>}</li>;
      })}</ul>
      {!readOnly&&<div className="packing-actions">
        {items.length>0&&<button disabled={!ready||busy} onClick={()=>persist(Object.fromEntries(items.map(i=>[i.id,!all])))}>{all?'Clear all':'Mark all packed'}</button>}
        <button onClick={()=>setEditing(true)}>{items.length?'Edit list':'Set up packing list'}</button>
        {Array.isArray(legacy)&&legacy.length>0&&<button disabled={!ready||busy} onClick={()=>persist(Object.fromEntries(legacy.filter(id=>items.some(i=>i.id===id)).map(id=>[id,true])),true)}>Import checklist saved on this phone</button>}
      </div>}
    </div>}
    {!readOnly&&editing&&<PrepChecklistModal state={state} updateState={updateState} cartId={cartId} onClose={()=>setEditing(false)}/>}
  </section>;
}
// Add / rename / remove the checklist items. Saved into the menus blob so the
// list syncs across devices (via the clobber-safe per-cart pushMenus path).
function PrepChecklistModal({ state, updateState, cartId, onClose }) {
  const [rows, setRows] = useState(() => prepChecklistFor(state, cartId).map(i => ({ ...i })));
  const [error, setError] = useState('');
  const set = (i, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, label: v } : r));
  const remove = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const add = () => setRows(rs => [...rs, { id: `p${Date.now().toString(36)}${rs.length}`, label: '' }]);
  const save = async () => {
    const clean = rows.map(r => ({ id: r.id, label: r.label.trim() })).filter(r => r.label);
    if (clean.length === 0) { setError('Add at least one item, or cancel.'); return; }
    const menus = { ...state.menus, [cartId]: { ...menuFor(state, cartId), prepChecklist: clean } };
    if(!(await updateState({ menus })))return;
    pushMenus(menus, cartId);
    onClose();
  };
  return (
    <EditModalShell title="Carry-from-home checklist" onClose={onClose} onSave={save} error={error}>
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Items you bring fresh each day. Ticks reset every morning.</div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={r.label} onChange={e => set(i, e.target.value)} placeholder="e.g. Fresh cream" style={{ ...editInput, flex: 1, marginBottom: 0 }} />
          <button onClick={() => remove(i)} style={{ border: `1px solid ${colors.border}`, background: '#fff', color: colors.red, borderRadius: 8, padding: '0 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{ width: '100%', border: `1px dashed ${colors.border}`, background: '#fff', color: brand.navy, borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>+ Add item</button>
    </EditModalShell>
  );
}
