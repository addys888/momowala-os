import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { localDate } from '../../lib/time';
import { monthlyAttendance, OFF_TYPES } from '../../lib/staffAttendance';
import { brand, colors } from '../../core';

const box = { background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
const input = { width: '100%', minHeight: 44, padding: 10, border: `1px solid ${colors.border}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginTop: 5, marginBottom: 12 };
const button = { background: brand.navy, color: '#fff', border: 0, padding: '11px 16px', borderRadius: 8, minHeight: 44, cursor: 'pointer', fontWeight: 700 };
export function StaffAttendance({ staff, cartId }) {
  const [records, setRecords] = useState({});
  const [selected, setSelected] = useState(String(staff[0]?.id || ''));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) throw new Error('Connect to the internet to manage staff attendance.');
      const { data, error } = await supabase.from('staff_hr').select('staff_id,details,updated_at').eq('cart_id',cartId);
      if (error) throw error;
      if (alive) setRecords(Object.fromEntries(data.map(r => [String(r.staff_id), r.details])));
    })().catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cartId,retry]);
  const member = staff.find(s => String(s.id) === selected) || staff[0];
  if (!staff.length) return <div style={box}>Register a staff member first to manage onboarding and days off.</div>;
  return <div>
    <p style={{ color: colors.muted, fontSize: 13 }}>Manage each staff member’s onboarding and monthly days off. Changes require an internet connection.</p>
    <label>Staff member<select aria-label="Staff member" style={input} value={String(member.id)} onChange={e => setSelected(e.target.value)}>{staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}{s.active ? '' : ' (inactive)'}</option>)}</select></label>
    {loading ? <p role="status">Loading attendance…</p> : error ? <div role="alert" style={box}>{error}<br/><button style={button} onClick={() => { setLoading(true); setError(''); setRetry(v => v+1); }}>Retry</button></div> :
      <StaffRecord key={`${cartId}:${member.id}`} member={member} details={records[String(member.id)] || {}} onSaved={details => setRecords(prev => ({...prev,[String(member.id)]:details}))} />}
  </div>;
}
function StaffRecord({ member, details, onSaved }) {
  const today = localDate();
  const [month,setMonth] = useState(today.slice(0,7));
  const [onboarding,setOnboarding] = useState(details.onboardingDate || '');
  const [allowance,setAllowance] = useState(details.monthlyOffAllowance ?? '');
  const [notes,setNotes] = useState(details.notes || '');
  const [date,setDate] = useState(today);
  const [type,setType] = useState(details.daysOff?.[today]?.type || 'weekly_off');
  const [duration,setDuration] = useState(String(details.daysOff?.[today]?.duration || 1));
  const [note,setNote] = useState(details.daysOff?.[today]?.note || '');
  const [editing,setEditing] = useState(!!details.daysOff?.[today]);
  const [expectedDay,setExpectedDay] = useState(details.daysOff?.[today] ?? null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const summary = monthlyAttendance(details,month,today);
  const save = async (field,value,before,day=null) => {
    if (busy) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data,error } = await supabase.rpc('app_save_staff_detail',{p_staff_id:member.id,p_field:field,p_date:day,p_before:before ?? null,p_value:value});
      if (error) throw error;
      if (data.record) onSaved(data.record.details);
      if (data.status !== 'ok') {
        if (data.record) { setOnboarding(data.record.details.onboardingDate || ''); setAllowance(data.record.details.monthlyOffAllowance ?? ''); setNotes(data.record.details.notes || ''); setExpectedDay(data.record.details.daysOff?.[day] ?? null); }
        throw new Error(data.message || 'Could not save.');
      }
      setMessage('Saved.'); return true;
    } catch(e) { setError(e.message || 'Could not save. Check your connection and retry.'); return false; }
    finally { setBusy(false); }
  };
  const chooseDate = value => {
    setDate(value); const entry=details.daysOff?.[value]; setExpectedDay(entry ?? null); setEditing(!!entry);
    setType(entry?.type || 'weekly_off'); setDuration(String(entry?.duration || 1)); setNote(entry?.note || '');
  };
  return <div>
    {error && <div role="alert" style={{...box,color:colors.red}}>{error}</div>}
    {message && <div role="status" style={{marginBottom:12,color:brand.tealDark}}>{message}</div>}
    <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <section style={box}><h3 style={{marginTop:0}}>{member.name} · Employment details</h3>
        <label>Onboarding date<input aria-label="Onboarding date" type="date" style={input} value={onboarding} onChange={e => setOnboarding(e.target.value)}/></label>
        <button style={button} onClick={() => save('onboardingDate',onboarding || null,details.onboardingDate)}>Save onboarding date</button>
        <div style={{marginTop:20}}><label>Monthly off allowance (optional)<input aria-label="Monthly off allowance" type="number" min="0" max="31" step="0.5" style={input} value={allowance} onChange={e => setAllowance(e.target.value)}/></label>
        <button style={button} onClick={() => save('monthlyOffAllowance',allowance === '' ? null : Number(allowance),details.monthlyOffAllowance)}>Save allowance</button></div>
        <p style={{fontSize:12,color:colors.muted}}>Allowance is a reference only. It does not calculate pay, deduct leave, or mark unrecorded days as present.</p>
        <label>Staff notes<textarea aria-label="Staff notes" maxLength={2000} style={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Role, shift arrangements, or other employment notes"/></label>
        <button style={button} onClick={() => save('notes',notes || null,details.notes)}>Save notes</button>
      </section>
      <section style={box}><h3 style={{marginTop:0}}>Monthly days off</h3>
        <label>Month<input aria-label="Attendance month" type="month" style={input} value={month} onChange={e => { if(e.target.value) setMonth(e.target.value); }}/></label>
        <div style={{display:'flex',flexWrap:'wrap',marginBottom:12}}>{[['Taken to date',summary.taken],['Planned',summary.planned],['Monthly allowance',details.monthlyOffAllowance ?? 'Not set']].map(([label,value]) => <div key={label} style={{flex:'1 1 100px',padding:10,background:brand.bg,margin:3,borderRadius:8}}><div style={{fontSize:12,color:colors.muted}}>{label}</div><strong style={{fontSize:22}}>{value}</strong></div>)}</div>
        <div style={{fontSize:13,color:colors.muted}}>{Object.entries(OFF_TYPES).map(([k,label]) => <span key={k} style={{display:'inline-block',marginRight:12}}>{label}: {summary.byType[k]}</span>)}</div>
        <p style={{fontSize:12,color:colors.muted}}>Taken includes recorded dates through today; future dates are planned. Half days count as 0.5.</p>
        {summary.entries.length === 0 ? <p>No days off recorded for this month.</p> : summary.entries.map(([day,entry]) => <div key={day} style={{borderTop:`1px solid ${colors.border}`,padding:'12px 0'}}>
          <strong>{day} · {OFF_TYPES[entry.type]}</strong><div>{entry.duration === 0.5 ? 'Half day' : 'Full day'}{day>today ? ' · Planned' : ''}</div>{entry.note && <div style={{fontSize:13,color:colors.muted,whiteSpace:'pre-wrap'}}>{entry.note}</div>}
          <button style={{...button,marginTop:8,marginRight:8}} onClick={() => chooseDate(day)}>Edit</button>
          <button style={{...button,background:'#fff',color:colors.red,border:`1px solid ${colors.border}`}} onClick={() => { if(confirm(`Remove the day-off record for ${day}?`)) void save('day',null,entry,day); }}>Remove</button>
        </div>)}
      </section>
      <section style={box}><h3 style={{marginTop:0}}>{editing ? 'Edit day off' : 'Record day off'}</h3>
        <label>Date<input aria-label="Day off date" type="date" min={details.onboardingDate || undefined} style={input} value={date} onChange={e => chooseDate(e.target.value)}/></label>
        <label>Type<select aria-label="Day off type" style={input} value={type} onChange={e => setType(e.target.value)}>{Object.entries(OFF_TYPES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Duration<select aria-label="Day off duration" style={input} value={duration} onChange={e => setDuration(e.target.value)}><option value="1">Full day</option><option value="0.5">Half day</option></select></label>
        <label>Note (optional)<textarea aria-label="Day off note" maxLength={500} style={input} value={note} onChange={e => setNote(e.target.value)}/></label>
        <button style={button} onClick={async () => { if (!date) { setError('Choose a date.'); return; } if(await save('day',{type,duration:Number(duration),note:note.trim()},expectedDay,date)) { setMonth(date.slice(0,7)); setEditing(true); setExpectedDay({type,duration:Number(duration),note:note.trim()}); } }}>{busy ? 'Saving…' : 'Save day off'}</button>
      </section>
    </fieldset>
  </div>;
}
