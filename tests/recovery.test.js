import test from 'node:test';
import assert from 'node:assert/strict';
import { reconciliationBackups, archiveRejected } from '../src/lib/recovery.js';
const op={id:'11111111-1111-4111-8111-111111111111',actor:'owner:a:',kind:'row',error:'Column not allowed: unrecorded',payload:{table:'day_close_logs',after:{id:12,cart_id:'a',date:'2026-10-12',physical_cash:500,phonepe_amount:250,unrecorded:true}}};
test('recovery scopes and deduplicates backups without changing amounts',()=>{
  const results=reconciliationBackups([op,op,{...op,id:'22222222-2222-4222-8222-222222222222',actor:'owner:b:'},null],op.actor,'a');
  assert.deepEqual(results,[op]); assert.equal(reconciliationBackups([op],'staff:a:','a').length,0);assert.equal(reconciliationBackups([op],op.actor,'b').length,0);
});
test('failed recovery-copy write never removes the pending operation',()=>{
  let removed=false;
  assert.throws(()=>archiveRejected({operations:[op],actor:op.actor,backup:[],persistBackup:()=>{throw Error('full');},remove:()=>{removed=true;}}),/full/);
  assert.equal(removed,false);
});
test('archive changes only the signed-in owner and writes before removing',()=>{
  const events=[];
  archiveRejected({operations:[op,{...op,id:'other',actor:'owner:b:'}],actor:op.actor,backup:[],persistBackup:value=>events.push(value),remove:id=>events.push(id)});
  assert.deepEqual(events,[[op],op.id]);
});
test('atomic day-close backup retains inventory commands and original operation ID',()=>{
  const bundled={...op,kind:'batch',payload:{commands:[{kind:'row',payload:op.payload},{kind:'inventory',payload:{cartId:'a',ops:{veg:{df:5,cset:0}}}}]}};
  assert.deepEqual(reconciliationBackups([bundled],op.actor,'a'),[bundled]);
});
