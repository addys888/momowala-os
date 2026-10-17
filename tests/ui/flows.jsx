import '../../src/lib/compat';
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OwnerApp} from '../../src/screens/owner/OwnerApp';
import {StaffApp} from '../../src/screens/Staff';
import {StoreContext} from '../../src/store';
import {getInitialState,TODAY} from '../../src/core';
import '../../src/index.css';
window.flow={results:[],errors:[],done:false,checkpoint:null};
window.addEventListener('error',e=>flow.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>flow.errors.push(String(e.reason)));
// No real backend: every request is denied except explicitly simulated read fixtures.
window.prompt=(message,payload)=>message==='cartlyft-native-v1'?JSON.stringify(JSON.parse(payload).command==='nativePushStatus'?{configured:true,token:'fixture-token',notifications:true}:{enabled:true,notifications:true,cartId:'momowala'}):null;
window.fetch=async(input)=>{
 const url=String(input); let data;
 if(url==='/api/push-subscribe')data={deliveryReady:true};
 else if(url.includes('/rpc/app_opening_status'))data={canLoad:false,managerActive:true,managerName:'Test Manager',record:{actor_name:'Test Manager',business_date:TODAY,quantities:{veg:100}}};
 else if(url.includes('/rest/v1/opening_alerts')||url.includes('/rest/v1/staff_hr'))data=[];
 else return new Response(JSON.stringify({message:'Isolated test: request blocked'}),{status:403,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
localStorage.clear();sessionStorage.setItem('mw:alertsSnoozed','1');
let initial=getInitialState();
initial.carts=initial.carts.filter(c=>c.id==='momowala').map(c=>({...c,name:'Isolated Test Cart',openTime:'15:00',closeTime:'22:30'}));
initial.staff=[{id:101,name:'Test Staff',mobile:'9999900001',cartId:'momowala',active:true}];
const yesterday=new Date(Date.parse(TODAY+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const item={id:'vs',name:'Veg Steam',type:'half',price:35,qty:1,key:'vs-half'};
initial.orders=[{id:Date.now()-60000,cartId:'momowala',date:TODAY,time:'12:00',token:'001',items:[item],total:35,payment:'cash',staff:'Test Staff',source:'staff-entry',stockDeducted:true},{id:Date.now()-86400000,cartId:'momowala',date:yesterday,time:'12:00',token:'002',items:[item],total:35,payment:'pending',staff:'Test Staff',source:'staff-entry',stockDeducted:true}];
function Harness(){
 const [state,setState]=useState(initial),[role,setRole]=useState('owner');
 const updateState=change=>{if(window.rejectSave)return false;setState(s=>({...s,...(typeof change==='function'?change(s):change)}));return true;};
 window.fixture={state,setRole,updateState};
 return <StoreContext.Provider value={{state,updateState,session:{role,staffId:101,cartId:'momowala',expiresAt:Date.now()+3600000},lastSync:Date.now(),refreshNow:async()=>{}}}>
 {role==='owner'?<OwnerApp state={state} updateState={updateState} cartId="momowala" onExit={()=>{}}/>:<StaffApp state={state} updateState={updateState} cartId="momowala" staffName="Test Staff" onExit={()=>{}}/>}
 </StoreContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
const pause=()=>new Promise(r=>setTimeout(r,250));
const buttons=()=>Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length);
const click=async text=>{const b=buttons().find(b=>b.textContent.trim()===text || (text==='Pending' && b.textContent.trim().endsWith('Pending')));if(!b)throw Error('Missing button '+text);b.click();await pause();};
const input=async(el,value)=>{check(el,'Input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await pause();};
const check=(value,message)=>{if(!value)throw Error(message);};
async function test(name,fn){try{await fn();check(!flow.errors.length,flow.errors.join('; '));flow.results.push({name,status:'PASS'});}catch(e){flow.results.push({name,status:'FAIL',error:e.message});} }
async function snapshot(name){window.scrollTo(0,0);flow.checkpoint=name;while(flow.checkpoint)await pause();}
(async()=>{await pause();await pause();
 for(const tab of ['Home','Orders','Stock','Menu','Reconcile','Staff','Reports'])await test('Owner '+tab,async()=>{await click(tab);check(document.querySelector('.partner-app'),'Screen missing');check(document.documentElement.scrollWidth<=innerWidth+2,'Horizontal screen overflow');if(tab==='Home'){const cells=document.querySelector('.revenue-detail').children;check(cells[1].getBoundingClientRect().left>cells[0].getBoundingClientRect().left,'Revenue columns stacked on old WebView');}if(tab==='Reports'){const cells=document.querySelector('.partner-grid').children;check(cells[1].getBoundingClientRect().left>cells[0].getBoundingClientRect().left,'Report cards stacked on old WebView');}await snapshot('owner-'+tab.toLowerCase());});
 await test('Owner Orders returns to today after overdue deep link',async()=>{await click('Home');const b=buttons().find(b=>b.textContent.includes('unpaid orders'));check(b,'Uncollected shortcut missing');b.click();await pause();check(document.querySelector('input[type=date]').value===yesterday,'Deep link wrong date');await click('Home');await click('Orders');check(document.querySelector('input[type=date]').value===TODAY,'Orders tab retained stale overdue date');});

 await test('Staff leave/holiday tab reads isolated records',async()=>{await click('Staff');await click('Leave & holidays');check(document.body.textContent.includes('Onboarding')||document.body.textContent.includes('onboarding'),'Leave form missing');});

 await test('Stock transfer moves pieces and records one movement',async()=>{await click('Stock');const before={...fixture.state.inventory.momowala.veg};await click('Freezer → Cart');await click('Load to cart');check(fixture.state.inventory.momowala.veg.freezer===before.freezer-50&&fixture.state.inventory.momowala.veg.cart===before.cart+50,'Transfer imbalance');check(fixture.state.cartLoadings.length===1,'Transfer log missing');});
 await test('Failed supply handover preserves quantities for retry',async()=>{await click('Stock');const open=buttons().find(b=>b.textContent.includes('Give Plates / Glasses'));open.click();await pause();const modal=buttons().find(b=>b.textContent==='Confirm Handover').parentElement.parentElement;await input(modal.querySelector('input'),'1');window.rejectSave=true;await click('Confirm Handover');window.rejectSave=false;check(buttons().some(b=>b.textContent==='Confirm Handover'),'Failed handover closed');await click('Confirm Handover');check(fixture.state.stockLogs.some(l=>l.type==='PLATE_SUPPLY'),'Retry did not save handover');});
 await test('Failed stock-type save keeps the editor open',async()=>{await click('Stock');await click('Edit stock types');const el=document.querySelector('input[value="Veg Momo"]');await input(el,'Test Veg');window.rejectSave=true;await click('Save');window.rejectSave=false;check(document.querySelector('input[value="Test Veg"]'),'Failed stock edit lost input');await click('Cancel');});
 await test('Menu edit persists across tabs',async()=>{await click('Menu');const edit=document.querySelector('button[aria-label^="Edit "]');check(edit,'Edit menu button missing');edit.click();await pause();await input(document.querySelector('input[placeholder="e.g. Masala Dosa"]'),'Test Veg Steam');await click('Save');await click('Home');await click('Menu');check(document.body.textContent.includes('Test Veg Steam'),'Edited item lost');});
 await test('Reports rejects fractional expenses rather than silently truncating',async()=>{await click('Reports');await click('Expenses');await click('Add');await input(document.querySelector('input[placeholder="e.g. 1200"]'),'12.5');const count=fixture.state.expenses.length;await click('Save');check(fixture.state.expenses.length===count,'Fractional expense silently truncated');await click('Cancel');});
 await test('Reports saves expense and preserves it across tabs',async()=>{await click('Home');await click('Reports');await click('Expenses');await click('Add');await input(document.querySelector('input[placeholder="e.g. 1200"]'),'120');await click('Save');check(fixture.state.expenses.some(e=>e.amount===120),'Expense not saved');await click('Home');await click('Reports');check(fixture.state.expenses.some(e=>e.amount===120),'Expense lost across tabs');});
 await test('Reconciliation saves counts and returns leftovers once',async()=>{await click('Reconcile');const counts=Array.from(document.querySelectorAll('input[type=number]'));check(counts.length>=5,'Reconciliation inputs missing');for(const el of counts)await input(el,'0');await click('Close Day & Save Report');check(fixture.state.dayCloseLogs.length===1,'Report not saved');await click('Home');await click('Reconcile');check(document.body.textContent.includes('Saved report'),'Saved report missing on return');});
 fixture.updateState({inventory:initial.inventory});fixture.setRole('staff');await pause();
 for(const tab of ['New Order','Pending','My Orders','Wastage','Shift'])await test('Staff '+tab,async()=>{await click(tab);check(document.querySelector('.partner-app'),'Screen missing');check(document.documentElement.scrollWidth<=innerWidth+2,'Horizontal screen overflow');await snapshot('staff-'+tab.toLowerCase().replaceAll(' ','-'));});
 await test('Staff previous-day pending order remains collectable',async()=>{await click('Pending');check(document.body.textContent.includes('002'),'Previous-day order disappeared');});

 await test('Failed split settlement preserves the entered amounts',async()=>{await click('Pending');await click('🔀 Split cash + UPI');await input(document.querySelector('input[type=tel]'),'20');window.rejectSave=true;await click('Save');window.rejectSave=false;check(document.querySelector('input[type=tel]')?.value==='20','Failed split payment dismissed and lost inputs');await click('Cancel');});
 await test('Settle previous-day counter order without deducting twice',async()=>{window.rejectSave=false;await click('New Order');await click('Pending');const before=fixture.state.inventory.momowala.veg.cart;await click('💵 Cash');check(fixture.state.orders.find(o=>o.token==='002').payment==='cash','Settlement missing');check(fixture.state.inventory.momowala.veg.cart===before,'Counter stock deducted twice');});
 await test('Wastage rejects fractions and saves whole pieces',async()=>{await click('Wastage');const before=fixture.state.wastageLogs.length,stock=fixture.state.inventory.momowala.veg.cart;await input(document.querySelector('input[type=number]'),'1.5');await click('Log wastage (removes from cart)');check(fixture.state.wastageLogs.length===before,'Fractional wastage rounded silently');await input(document.querySelector('input[type=number]'),'2');await click('Log wastage (removes from cart)');check(fixture.state.wastageLogs.length===before+1&&fixture.state.inventory.momowala.veg.cart===stock-2,'Wastage accounting wrong');});
 await test('Cash order rapid double tap creates one order and one stock deduction',async()=>{await click('New Order');const add=buttons().find(b=>b.textContent.startsWith('Half · ₹35'));check(add,'Menu portion missing');add.click();await pause();await click('🔀 Split');await input(document.querySelector('input[type=tel]'),'20');window.rejectSave=true;await click('Save');window.rejectSave=false;check(document.querySelector('input[type=tel]')?.value==='20','Failed new-order split lost input');await click('Cancel');const before=fixture.state.orders.length,stock=fixture.state.inventory.momowala.veg.cart;const cash=buttons().find(b=>b.textContent==='💵 Cash');check(cash,'Cash button missing');cash.click();cash.click();await pause();check(fixture.state.orders.length===before+1,'Duplicate order');check(fixture.state.inventory.momowala.veg.cart===stock-5,'Wrong stock deduction');check(!document.body.textContent.includes('#Waiting'),'Pending text shown as an oversized order number');await snapshot('staff-order-created');});
 flow.done=true;
})();
