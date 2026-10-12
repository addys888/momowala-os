import { localDate, istNowMinutes } from './time.js';
export function openingBusinessDate(openTime, now = new Date()) {
  const day=localDate(now);
  const match=/^(\d{2}):(\d{2})$/.exec(openTime || '');
  if(!match)return day;
  const minutes=Number(match[1])*60+Number(match[2]);
  if(minutes>=30 || istNowMinutes(now)<1440+minutes-30)return day;
  const next=new Date(day+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  return next.toISOString().slice(0,10);
}
