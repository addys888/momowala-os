import {useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useStore} from '../store';

export function StockRefill({cartId,date,stockTypes,inventory}) {
 const {refreshNow,session}=useStore();
 const storageKey=`cartlyft:refill:${cartId}:${date}:${session?.staffId}`;
 const [restored]=useState(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null');}catch{return null;}});
 const [open,setOpen]=useState(!!restored),[category,setCategory]=useState(restored?.p_category||''),[quantity,setQuantity]=useState(restored?.p_quantity||''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState(restored);
 const saving=useRef(false),request=useRef(restored);
 const field={display:'block',width:'100%',minHeight:44,padding:10,margin:'6px 0 12px',fontSize:16,border:'1px solid #CCD6E0',borderRadius:8};
 const button={minHeight:44,padding:'10px 16px',border:0,borderRadius:9,background:'#0A2F5C',color:'#fff',fontWeight:700};
 async function submit(e) {
  e.preventDefault();if(saving.current)return;
  const n=Number(quantity);
  if(!category||!Number.isSafeInteger(n)||n<=0||n>100000){setMessage('Choose a category and enter a positive whole number of pieces.');return;}
  // Freeze an uncertain request: retrying must never silently create another stock transfer.
  if(!request.current)request.current={p_cart_id:cartId,p_date:date,p_operation_id:crypto.randomUUID(),p_category:category,p_quantity:n};
  try{localStorage.setItem(storageKey,JSON.stringify(request.current));}catch{setMessage('Device storage is unavailable. Free some space before refilling.');return;}
  saving.current=true;setBusy(true);setPending(request.current);setMessage('');
  try{
   const {error}=await supabase.rpc('app_refill_stock',request.current);if(error)throw error;
   localStorage.removeItem(storageKey);request.current=null;setPending(null);setQuantity('');setOpen(false);setMessage('Refill saved. Stock has been added to the cart.');
   try{await refreshNow();}catch{setMessage('Refill saved. Reconnect to refresh the displayed stock.');}
  }catch(error){if(/^(P0001|42501|22)/.test(error.code||'')){localStorage.removeItem(storageKey);request.current=null;setPending(null);}setMessage(error.message||'Unable to confirm the refill. Retry the same request when connected.');}
  finally{saving.current=false;setBusy(false);}
 }
 return <section aria-label="Refill cart stock" style={{borderTop:'1px solid #DAE3EC',marginTop:16,paddingTop:16}}>
  <h3 style={{margin:'0 0 6px',fontSize:17}}>Refill stock</h3><p style={{fontSize:13,color:'#617184'}}>Add more pieces from the freezer to today’s remaining cart stock.</p>
  {message&&<p role="status" style={{fontSize:13,margin:'12px 0'}}>{message}</p>}
  {!open?<button style={button} onClick={()=>{setOpen(true);setMessage('');}}>Add refill</button>:<form onSubmit={submit}>
   <label>Category<select aria-label="Refill category" style={field} required disabled={busy||!!pending} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose category</option>{stockTypes.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
   {category&&<p style={{fontSize:13}}>Freezer: {inventory[category]?.freezer||0}</p>}
   <label>Quantity to add<input aria-label="Refill quantity" style={field} type="number" inputMode="numeric" min="1" max="100000" step="1" required disabled={busy||!!pending} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   <button style={button} disabled={busy}>{busy?'Saving…':pending?'Retry refill':'Confirm refill'}</button>
   {!pending&&<button type="button" style={{...button,background:'#fff',color:'#0A2F5C',marginLeft:8}} disabled={busy} onClick={()=>setOpen(false)}>Cancel</button>}
  </form>}
 </section>;
}
