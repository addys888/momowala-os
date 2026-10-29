import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useStore} from '../store';
import {istTime} from '../lib/time';
export function StaffMeals({cartId,date,stockTypes=[],staff=[],manager=false}) {
 const {refreshNow,session}=useStore();
 const key=`cartlyft:meal:${cartId}:${date}:${session?.staffId}`;
 const [items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState(''),[category,setCategory]=useState(''),[qty,setQty]=useState('');
 const request=useRef(null),saving=useRef(false),epoch=useRef(0);const [pending,setPending]=useState(false);
 const load=useCallback(async()=>{const version=++epoch.current;const {data,error}=await supabase.rpc('app_staff_meals',{p_cart_id:cartId,p_date:date});if(version!==epoch.current)return;if(error){setError(error.message);return;}setItems(data.items);},[cartId,date]);
 useEffect(()=>{let active=true;request.current=null;setPending(false);setItems([]);setError('');setName('');setCategory('');setQty('');
  try{const p=JSON.parse(localStorage.getItem(key)||'null');if(p){request.current=p;setPending(true);setName(String(p.p_staff_id));setCategory(p.p_category);setQty(String(p.p_quantity));}}catch{}
  const refresh=()=>{if(active&&!document.hidden)void load();};refresh();const timer=setInterval(refresh,30000);return()=>{active=false;epoch.current++;clearInterval(timer);};
 },[key,load]);
 async function save(e){e.preventDefault();if(saving.current)return;
  if(!request.current){if(!name||!category||!Number.isInteger(Number(qty))||Number(qty)<1||Number(qty)>10){setError('Choose staff, category and 1–10 whole pieces.');return;}
   request.current={p_cart_id:cartId,p_date:date,p_operation_id:crypto.randomUUID(),p_staff_id:Number(name),p_category:category,p_quantity:Number(qty)};}
  try{localStorage.setItem(key,JSON.stringify(request.current));}catch{setError('Cannot retain this request safely. Free device space and retry.');return;}
  saving.current=true;setBusy(true);setPending(true);setError('');
  try{const {error}=await supabase.rpc('app_log_staff_meal',request.current);if(error)throw error;localStorage.removeItem(key);request.current=null;setPending(false);setQty('');await load();await refreshNow(false);}
  catch(e){setError(e.message||'Save not confirmed. Retry the same meal.');if(/^(P0001|42501|22)/.test(e.code||'')){localStorage.removeItem(key);request.current=null;setPending(false);}}
  finally{setBusy(false);saving.current=false;}
 }
 const totals={};for(const i of items){const k=`${i.staff_id}:${i.category}`;totals[k]||={name:i.staff_name,category:i.category,quantity:0};totals[k].quantity+=i.quantity;}
 return <section className="partner-card" aria-label="Staff meals"><h3>Staff meals · {items.reduce((s,i)=>s+i.quantity,0)} pcs</h3><p className="muted">{date} · Recorded separately from sales and wastage.</p>
 {manager&&<details open={pending||undefined}><summary>Log staff meal</summary><form onSubmit={save}>
 <label>Staff name<select required disabled={busy||pending} value={name} onChange={e=>setName(e.target.value)}><option value="">Choose staff</option>{staff.filter(s=>s.active!==false&&s.cartId===cartId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Category<select required disabled={busy||pending} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose category</option>{stockTypes.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
 <label>Pieces (1–10)<input type="number" inputMode="numeric" required min="1" max="10" step="1" disabled={busy||pending} value={qty} onChange={e=>setQty(e.target.value)}/></label><button disabled={busy}>{busy?'Saving…':pending?'Retry meal':'Save meal'}</button></form></details>}
 {error&&<p role="alert">{error} <button onClick={load}>Refresh</button></p>}
 {Object.entries(totals).map(([k,t])=><p key={k}>{t.name} · {stockTypes.find(s=>s.key===t.category)?.label||t.category}: <strong>{t.quantity} pcs</strong></p>)}
 {!!items.length&&<details><summary>View entries ({items.length})</summary>{items.map(i=><p key={i.operation_id}>{i.staff_name} · {stockTypes.find(t=>t.key===i.category)?.label||i.category} · {i.quantity} pcs · {istTime(new Date(i.created_at))} IST</p>)}</details>}
 </section>;
}
