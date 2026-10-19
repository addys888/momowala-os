import {supabase} from './supabase';
export async function readPacking(cartId,date) {
 if(!supabase)throw Error('Connect to load the packing checklist.');
 const {data,error}=await supabase.from('daily_packing').select('item_id,checked').eq('cart_id',cartId).eq('business_date',date);
 if(error)throw error;
 return new Set(data.filter(row=>row.checked).map(row=>row.item_id));
}
export async function writePacking(cartId,date,changes,importOnly=false) {
 if(!supabase)throw Error('Connect to save the packing checklist.');
 const {data,error}=await supabase.rpc('app_save_packing',{p_cart_id:cartId,p_date:date,p_changes:changes,p_import:importOnly});
 if(error||data?.status!=='ok')throw error||Error('Packing checklist was not saved.');
 return readPacking(cartId,date);
}
