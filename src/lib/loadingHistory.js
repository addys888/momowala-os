import {localDate,istNowMinutes} from './time.js';
export function shiftDay(date,days) {
 return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);
}
export function loadingWeek(date) {
 const day=new Date(`${date}T12:00:00Z`).getUTCDay();
 const start=shiftDay(date,-((day+6)%7));
 return {start,end:shiftDay(start,6)};
}
export function loadingReference(record) {
 if(!record?.created_at || !record.reference_number)return 'Reference pending';
 const stamp=new Date(record.created_at),minutes=istNowMinutes(stamp);
 return `${localDate(stamp)}_${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}_${String(record.reference_number).padStart(4,'0')}`;
}
