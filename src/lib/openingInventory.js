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

export function validateOpeningLoad(types, quantities, inventory) {
 const errors={},values={};let total=0;
 if(!types.length)return {errors,values,total,error:'No stock categories configured. Ask your owner to set them up.'};
 for(const type of types){
  const raw=quantities[type.key];const n=Number(raw);
  if(raw===undefined||raw===null||String(raw).trim()==='')errors[type.key]='Enter pieces to load, or 0 for none.';
  else if(!Number.isSafeInteger(n)||n<0||n>100000)errors[type.key]='Enter a whole number from 0 to 100,000.';
  else if(!Number.isFinite(Number(inventory[type.key]?.freezer)))errors[type.key]='Stock is unavailable. Refresh before loading.';
  else if(n>Number(inventory[type.key].freezer))errors[type.key]=`Only ${inventory[type.key].freezer} pieces available in freezer.`;
  else {total+=n;if(n>0)values[type.key]=n;}
 }
 return {errors,values,total,error:Object.keys(errors).length?'Check the highlighted quantities.':total===0?'Load at least one category before confirming.':''};
}
