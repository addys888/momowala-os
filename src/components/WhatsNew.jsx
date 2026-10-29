import { useState } from 'react';
import { nativeCommand } from '../lib/nativeApp';

const updates = [
 {code:25,items:['Compact manager closing: submit physical counts without stock-difference warnings or mandatory notes. Owners see the comparison.','Managers can log staff meals of 1–10 pieces, with stock deductions and owner report totals.','Mark all bell notifications as read. Closing reminders repeat every 10 minutes until submitted, except on recorded leave or off days.']},
 {code:24,items:['Staff stock balances are hidden. Category warnings flag low stock and urgent refills.','Closing asks for a physical count without revealing the expected balance. Owners retain the full comparison.','The notification bell focuses on opening stock, refills, closing reports and announcements. Notification delivery and refresh are more reliable.']},
 {code:23,items:['Orders and other changes are confirmed by the server before they appear as saved.','Faster account loading and safer recovery of unsent orders, without duplicating stock deductions.','New notification bell for cart activity and owner announcements to staff.']},
 {code:22,items:['Opening stock now shows the submission date, time and permanent reference number.','Owners can browse weekly opening history and daily opening/refill quantities in Stock.','Opening stock requires an explicit quantity for each category, with clearer validation and save confirmation.']},
 {code:12,items:['Manager closing: submit cash and remaining stock at the owner’s scheduled time.']},
 {code:13,items:['View the owner’s Pack Today checklist from your manager home screen.','Notification setup now stays quietly in the background once enabled.']},
 {code:14,items:['Your cart manager is marked beside their name.','Managers enter fresh opening stock in a daily popup. Once saved, find it in Stock.','Remaining food stock resets each day; today’s load and sales stay on the server.']},
 {code:15,items:['Owners can review daily operating profit after closing, with supplies scaled to sold quantities and unsold stock shown separately.','Updated ringing alert sound, with vibration until the required acknowledgment or submission.','Closing configuration now works for carts setting it up for the first time.']},
];
export function WhatsNew({staffId,cartId,children}) {
 const [info]=useState(()=>nativeCommand('appInfo'));
 const key=`cartlyft:release-seen:${cartId}:${staffId}`;
 const [seen,setSeen]=useState(()=>{try{return Number(localStorage.getItem(key))||0;}catch{return 0;}});
 const [dismissed,setDismissed]=useState(false);
 const items=updates.filter(r=>r.code>seen&&r.code<=info?.versionCode).flatMap(r=>r.items);
 if(!info?.versionCode||dismissed||!items.length)return children;
 const acknowledge=()=>{try{localStorage.setItem(key,String(info.versionCode));}catch{/* Still allow this session to continue if storage is unavailable. */}setSeen(info.versionCode);setDismissed(true);};
 return <main className="whats-new" aria-label="What’s new">
  <div className="whats-new-content"><span className="whats-new-brand">CARTLYFT PARTNER</span>
   <h1>What’s new</h1><p>Version {info.versionName} · Updates for your shift</p>
   <ul>{items.map(item=><li key={item}>{item}</li>)}</ul>
   <button autoFocus onClick={acknowledge}>Got it — continue</button>
  </div>
 </main>;
}
