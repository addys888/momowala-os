import React, { useState, useEffect, useRef } from 'react';
import { readPacking, writePacking } from '../lib/packing';
import { storage, pushMenus } from '../lib/store';
import { TODAY, colors, brand, editInput, prepChecklistFor, menuFor } from '../core';
import { EditModalShell } from './shared';

// Daily completion is confirmed by Supabase and shared across phones.
export function PrepChecklist({ state, updateState, cartId }) {
  const items = prepChecklistFor(state, cartId);
  const dateKey = `mw:prep:${cartId}:${TODAY}`;
  const [checked, setChecked] = useState(new Set());
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [legacy, setLegacy] = useState(() => storage.get(dateKey, []));
  const busyRef = useRef(false), epoch = useRef(0);
  useEffect(() => {
    let alive=true;
    const refresh=async()=>{
      if(busyRef.current||document.hidden)return;
      const started=epoch.current;
      try { const next=await readPacking(cartId,TODAY); if(alive&&started===epoch.current){setChecked(next);setReady(true);setError('');} }
      catch { if(alive)setError('Packing status unavailable. Reconnect to load saved progress.'); }
    };
    void refresh(); const timer=setInterval(refresh,12000);
    window.addEventListener('online',refresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',refresh);};
  },[cartId]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (items.length === 0 && !editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ flex: '1 1 150px', minWidth: 0, background: '#fff', border: `1px dashed ${colors.border}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', color: colors.muted, fontSize: 12.5, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
        🧺 Set up packing list
      </button>
    );
  }

  const persist = async (changes,importOnly=false) => {
    if(!ready||busyRef.current)return;
    busyRef.current=true;epoch.current++;setBusy(true);setError('');
    try { const next=await writePacking(cartId,TODAY,changes,importOnly);setChecked(next);
      if(importOnly){storage.set(dateKey,[]);setLegacy([]);} }
    catch { setError('Could not confirm saving. Reconnect and retry; saved server progress is kept.'); }
    finally {busyRef.current=false;setBusy(false);}
  };
  const toggle = id => persist({[id]:!checked.has(id)});
  const markAll = () => persist(Object.fromEntries(items.map(i=>[i.id,true])));
  const clearAll = () => persist(Object.fromEntries(items.map(i=>[i.id,false])));

  const done = items.filter(i => checked.has(i.id)).length;
  const all = done === items.length && items.length > 0;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const accent = all ? '#0F7B0F' : brand.navy;

  return (
    <>
      {/* Compact tile — sits in the utility row */}
      <button onClick={() => setOpen(o => !o)} style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${all ? '#CBE7CB' : colors.border}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🧺</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: all ? '#0F7B0F' : colors.ink, lineHeight: 1.1 }}>{all ? 'Packed ✓' : 'Pack today'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 5, background: '#EEEBE2', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 5 }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.muted }}>{ready ? `${done}/${items.length}` : 'Loading…'}</span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </button>

      {/* Full-width panel — wraps onto its own line below the tiles */}
      {open && (
        <div style={{ flex: '1 1 100%', width: '100%', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {error && <p role="alert" style={{padding:12}}>{error}</p>}
          {legacy.length>0 && <button disabled={!ready||busy} onClick={()=>persist(Object.fromEntries(legacy.filter(id=>items.some(i=>i.id===id)).map(id=>[id,true])),true)}>Import checklist saved on this phone</button>}
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
            {items.map(it => {
              const on = checked.has(it.id);
              return (
                <button key={it.id} disabled={!ready||busy} onClick={() => toggle(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${on ? '#CBE7CB' : colors.border}`, background: on ? '#F3FAF3' : '#fff', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? '#0F7B0F' : colors.border}`, background: on ? '#0F7B0F' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{on ? '✓' : ''}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.3, color: on ? colors.muted : colors.ink, textDecoration: on ? 'line-through' : 'none' }}>{it.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 16px 12px' }}>
            <button disabled={!ready||busy} onClick={all ? clearAll : markAll} style={{ background: 'transparent', border: 'none', color: brand.navy, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{all ? 'Clear all' : 'Mark all packed'}</button>
            <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: 'none', color: colors.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Edit list</button>
          </div>
        </div>
      )}
      {editing && <PrepChecklistModal state={state} updateState={updateState} cartId={cartId} onClose={() => setEditing(false)} />}
    </>
  );
}

// Add / rename / remove the checklist items. Saved into the menus blob so the
// list syncs across devices (via the clobber-safe per-cart pushMenus path).
function PrepChecklistModal({ state, updateState, cartId, onClose }) {
  const [rows, setRows] = useState(() => prepChecklistFor(state, cartId).map(i => ({ ...i })));
  const [error, setError] = useState('');
  const set = (i, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, label: v } : r));
  const remove = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const add = () => setRows(rs => [...rs, { id: `p${Date.now().toString(36)}${rs.length}`, label: '' }]);
  const save = () => {
    const clean = rows.map(r => ({ id: r.id, label: r.label.trim() })).filter(r => r.label);
    if (clean.length === 0) { setError('Add at least one item, or cancel.'); return; }
    const menus = { ...state.menus, [cartId]: { ...menuFor(state, cartId), prepChecklist: clean } };
    updateState({ menus });
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
