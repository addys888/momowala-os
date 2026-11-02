import {useRef,useState} from 'react';
import {OrderItemLines} from './shared';

export function kitchenOrders(orders, ready=false) {
 return orders.filter(o=>o.payment!=='cancelled' && !!o.revision && (ready ? o.prepStatus==='ready' : o.prepStatus!=='ready')).sort((a,b)=>a.id-b.id);
}

// Preparation and payment are independent: collecting cash must not hide food
// that the chef still needs to prepare. Only server-confirmed orders appear.
export function KitchenQueue({orders,onPrep,onPayment}) {
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(null),[error,setError]=useState('');
 const saving=useRef(false);
 async function advance(order,status) {
  if(saving.current)return;
  saving.current=true;setBusy(order.id);setError('');
  try {const result=await onPrep(order.id,status);if(result===false)throw new Error('Status was not saved. Refresh and retry.');}
  catch(e){setError(e.message||'Unable to save kitchen status. Retry.');}
  finally{saving.current=false;setBusy(null);}
 }
 const queue=kitchenOrders(orders,ready);
 return <section aria-label="Kitchen queue"><h2>Kitchen queue</h2><p>Oldest first · Match the token on the kitchen ticket. Payment is tracked separately.</p>
 <div style={{display:'flex',gap:8,marginBottom:16}}><button className="quiet-button" aria-pressed={!ready} onClick={()=>setReady(false)}>To prepare ({kitchenOrders(orders).length})</button><button className="quiet-button" aria-pressed={ready} onClick={()=>setReady(true)}>Ready ({kitchenOrders(orders,true).length})</button></div>
 {error&&<p role="alert">{error}</p>}
 {!queue.length&&<p>{ready?'No ready orders yet.':'Kitchen queue is clear.'}</p>}
 {queue.map(o=><article className="partner-card" key={o.id} style={{marginBottom:12}}>
 <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><strong style={{fontSize:28,borderRadius:12,background:'#0c3156',color:'#fff',padding:'6px 12px'}}>#{o.token}</strong><span>{o.time} · {o.prepStatus==='ready'?'Ready':o.prepStatus==='preparing'?'Preparing':'New'}</span></header>
 <OrderItemLines items={o.items}/>
 <p>{['pending','unpaid'].includes(o.payment)?'Payment outstanding — collect before handover':'Payment recorded'}</p>
 <div style={{display:'flex',gap:8}}>{o.prepStatus!=='ready'&&<button className="quiet-button" disabled={busy!==null} onClick={()=>advance(o,o.prepStatus==='preparing'?'ready':'preparing')}>{busy===o.id?'Saving…':o.prepStatus==='preparing'?'Mark ready':'Start preparing'}</button>}{['pending','unpaid'].includes(o.payment)&&<button className="quiet-button" onClick={onPayment}>Open unpaid orders</button>}</div>
 </article>)}
 </section>;
}
