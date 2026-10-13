import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
// A deliberately local-only target: never run fixtures against production.
const args = ['-h','127.0.0.1','-p',process.env.TEST_PG_PORT || '55439','-d','postgres','-v','ON_ERROR_STOP=1','-At'];
async function sql(query) { return (await run('psql',[...args,'-c',query])).stdout.trim(); }
const quote = x => `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`;
const owner = '11111111-1111-4111-8111-111111111111';
const staff = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const admin = '44444444-4444-4444-8444-444444444444';
const customer = '55555555-5555-4555-8555-555555555555';
async function request(query,token=null,key=null) {
  const headers = { 'x-app-session': token, 'x-customer-key': key };
  const out = await sql(`begin; set local role anon; set local request.headers = '${JSON.stringify(headers)}'; ${query}; commit;`);
  return out.split('\n').filter(x => !['BEGIN','SET','COMMIT',''].includes(x)).at(-1);
}
async function mutate(kind,payload,token=staff,id=crypto.randomUUID(),key=null) {
  return JSON.parse(await request(`select app_mutate('${id}','${kind}',${quote(payload)})`,token,key));
}
const item = { id: 'veg', name: 'Veg Full', type: 'full', price: 70, qty: 1 };
const order = id => ({ id, cart_id: 'test-a', date: '2026-10-11', time: '12:00', token: 'local', items: [item], total:70,payment:'pending',source:'qr-order',staff:null,split:null,settled_at:null,cancel_reason:null,prep_status:null,acknowledged_at:null,customer_name:'Test',customer_phone:'9000000000',outlet:'test-a',outlet_name:'A' });
await sql(`
 delete from orders where cart_id in ('test-a','test-b');
 delete from app_private.operations;
 insert into carts(id,name,active,owner_mobile) values('test-a','A',true,'9000000001'),('test-b','B',true,'9000000002') on conflict(id) do update set active=true,name=excluded.name;
 insert into staff(id,cart_id,name,mobile,active) values(101,'test-a','Test Staff','9000000003',true) on conflict(id) do update set active=true,name=excluded.name;
 insert into app_sessions(token,role,cart_id,name,staff_id,expires_at) values
 ('${owner}','owner','test-a',null,null,now()+interval '1 day'),('${staff}','staff','test-a','Test Staff',101,now()+interval '1 day'),
 ('${other}','owner','test-b',null,null,now()+interval '1 day'),('${admin}','admin',null,null,null,now()+interval '1 day')
 on conflict(token) do update set expires_at=excluded.expires_at;
 insert into menus(id,data) values(1,'{"test-a":{"items":[{"id":"veg","name":"Veg","full":70,"half":35,"pcsFull":10,"pcsHalf":5,"stockKey":"veg"}],"lassi":[],"addons":[]}}') on conflict(id) do update set data=excluded.data;
 insert into inventory(id,data) values(1,'{"test-a":{"veg":{"freezer":100,"cart":100}},"test-b":{"veg":{"freezer":200,"cart":200}}}') on conflict(id) do update set data=excluded.data;
`);

test('public cannot read private records or invoke old privileged functions', async () => {
  assert.equal(await request('select count(*) from staff'),'0');
  assert.equal(await request('select count(*) from orders'),'0');
  assert.equal(await request('select count(*) from carts'),'0');
  await assert.rejects(request("select apply_inventory('test-a','{}')"),/permission denied/);
  await assert.rejects(request("update carts set active=false where id='test-a'"),/permission denied/);
  await assert.rejects(request('select owner_password_hash from carts',owner),/permission denied/);
  const catalog=JSON.parse(await request('select app_catalog()'));
  assert.equal(catalog.carts[0].owner_mobile,undefined);
});
test('first-time password claims are denied', async () => {
  const r=JSON.parse(await request("select app_set_password('owner','9000000001','test-a','attacker')"));
  assert.equal(r.status,'error');
});
test('tenant scope and staff permissions are enforced', async () => {
  assert.equal(await request('select count(*) from staff',other),'0');
  const inv=JSON.parse(await request('select app_inventory()',owner));
  assert.deepEqual(Object.keys(inv),['test-a']);
  await assert.rejects(mutate('inventory',{cartId:'test-b',ops:{veg:{dc:-5}}}),/Not authorised/);
  await assert.rejects(mutate('inventory',{cartId:'test-a',ops:{veg:{fset:99}}}),/Not authorised/);
});
test('customer insert validates price and only exposes their own order', async () => {
  const bad=order(91001); bad.items=[{...item,price:1}]; bad.total=1;
  await assert.rejects(mutate('order',{before:null,after:bad},null,crypto.randomUUID(),customer),/Menu price changed/);
  const r=await mutate('order',{before:null,after:order(91001)},null,crypto.randomUUID(),customer);
  assert.equal(r.status,'ok'); assert.equal(r.order.stock_deducted,false);
  assert.equal(await request('select count(*) from orders',null,customer),'1');
  assert.equal(await request('select count(*) from orders',null,crypto.randomUUID()),'0');
  await assert.rejects(mutate('order',{before:r.order,after:{...r.order,payment:'cash'}},null,crypto.randomUUID(),customer),/Not authorised/);
});
test('concurrent settlement deducts stock exactly once; lost response retry is idempotent', async () => {
  const before=order(91001), after={...before,payment:'cash',staff:'Test Staff',settled_at:new Date().toISOString()};
  const id=crypto.randomUUID();
  const results=await Promise.all([mutate('order',{before,after},staff,id),mutate('order',{before,after})]);
  assert.equal(results.filter(r=>r.status==='ok').length,1);
  assert.equal(results.filter(r=>r.status==='conflict').length,1);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'90');
  await mutate('order',{before,after},staff,id);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'90');
});
test('pending counter creation and retry are atomic', async () => {
  const after={...order(91002),source:'staff-entry'};const id=crypto.randomUUID();
  await mutate('order',{before:null,after},staff,id); await mutate('order',{before:null,after},staff,id);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'80');
});
test('row edits compare only changed fields and reject stale values', async () => {
  const payload={table:'carts',before:{id:'test-a',name:'A'},after:{id:'test-a',name:'Updated'}};
  assert.equal((await mutate('row',payload,owner)).status,'ok');
  assert.equal((await mutate('row',{...payload,after:{id:'test-a',name:'Stale'}},owner)).status,'conflict');
  assert.equal(await sql("select name from carts where id='test-a'"),'Updated');
});
test('inventory queue receipts prevent duplicate stock movements', async () => {
  const id=crypto.randomUUID(),p={cartId:'test-a',ops:{veg:{dc:5}}};
  await mutate('inventory',p,owner,id); await mutate('inventory',p,owner,id);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'85');
});
test('disabled staff session loses access immediately', async () => {
  await sql('update staff set active=false where id=101');
  assert.equal(await request('select count(*) from orders',staff),'0');
  await assert.rejects(mutate('inventory',{cartId:'test-a',ops:{veg:{dc:-5}}}),/Not authorised|Sign in required/);
});

async function saveStaff(field,value,before=null,date=null,token=owner) {
 return JSON.parse(await request(`select app_save_staff_detail(101,'${field}',${date ? `'${date}'` : 'null'},${quote(before)},${quote(value)})`,token));
}
test('staff HR records are owner-only and tenant-scoped',async()=>{
 await sql('delete from staff_hr where staff_id=101; update staff set active=true where id=101');
 assert.equal((await saveStaff('onboardingDate','2026-10-01')).status,'ok');
 assert.equal(await request('select count(*) from staff_hr',owner),'1');
 for(const token of [null,staff,other]) {
  assert.equal(await request('select count(*) from staff_hr',token),'0');
  await assert.rejects(saveStaff('notes','Blocked',null,null,token),/Not authorised/);
 }
 await assert.rejects(request("update staff_hr set details='{}'",owner),/permission denied/);
});
test('concurrent days preserve each other; retry cannot duplicate a day',async()=>{
 const a={type:'weekly_off',duration:1,note:'Rest'},b={type:'leave',duration:0.5,note:'Personal'};
 const results=await Promise.all([saveStaff('day',a,null,'2026-10-05'),saveStaff('day',b,null,'2026-10-06')]);
 assert(results.every(r=>r.status==='ok'));
 assert.equal((await saveStaff('day',a,null,'2026-10-05')).status,'ok');
 const details=JSON.parse(await sql('select details from staff_hr where staff_id=101'));
 assert.equal(Object.keys(details.daysOff).length,2);
});
test('same-day stale changes conflict and owner can remove a saved entry',async()=>{
 const a={type:'weekly_off',duration:1,note:'Rest'};
 assert.equal((await saveStaff('day',{...a,note:'Stale'},null,'2026-10-05')).status,'conflict');
 assert.equal((await saveStaff('day',null,a,'2026-10-05')).status,'ok');
 assert.equal((await saveStaff('day',null,a,'2026-10-05')).status,'ok');
});
test('staff attendance rejects invalid dates, durations and employment ranges',async()=>{
 const a={type:'holiday',duration:1,note:''};
 await assert.rejects(saveStaff('day',a,null,'2026-09-30'),/before the onboarding/);
 await assert.rejects(saveStaff('day',{...a,duration:3},null,'2026-10-07'),/Invalid day-off/);
 await assert.rejects(saveStaff('day',a,null,'2026-02-30'),/out of range/);
 await assert.rejects(saveStaff('monthlyOffAllowance',32),/Allowance/);
 await assert.rejects(saveStaff('onboardingDate','2026-10-20','2026-10-01'),/after an existing/);
});

test('opening load is scoped, atomic, idempotent and cannot overdraft freezer', async () => {
  await sql("delete from opening_loads where cart_id in ('test-a','test-b'); update carts set open_time='16:00' where id='test-a'; update inventory set data=jsonb_set(data,'{test-a,veg}','{\"freezer\":100,\"cart\":0}') where id=1");
  const id=crypto.randomUUID();
  const load=(qty,token=staff,operation=id)=>request(`select app_load_opening_inventory('test-a',(now() at time zone 'Asia/Kolkata')::date,'${operation}',${quote(qty)})`,token);
  await assert.rejects(load({veg:20},other),/Not authorised/);
  await assert.rejects(load({veg:20},null),/Not authorised/);
  await assert.rejects(load({veg:101}),/Not enough freezer stock/);
  await assert.rejects(load({veg:0.5}),/whole-piece/);
  assert.equal(await request('select count(*) from opening_loads',staff),'0');
  const saved=JSON.parse(await load({veg:40}));assert.equal(saved.status,'ok');
  assert.equal(JSON.parse(await load({veg:40})).status,'ok');
  assert.equal(JSON.parse(await load({veg:50},staff,crypto.randomUUID())).status,'conflict');
  const inv=JSON.parse(await request('select app_inventory()',staff));assert.deepEqual(inv['test-a'].veg,{freezer:60,cart:40});
  assert.equal(await request('select count(*) from opening_loads',other),'0');
  await assert.rejects(request("delete from opening_loads",staff),/permission denied/);
});

test('concurrent opening submissions transfer once and failed batches leave no partial logs', async () => {
  await sql("delete from opening_loads where cart_id='test-a'; delete from cart_loadings where cart_id='test-a' and note='Opening stock transfer'; update inventory set data=jsonb_set(data,'{test-a,veg}','{\"freezer\":100,\"cart\":0}') where id=1");
  const load=qty=>request(`select app_load_opening_inventory('test-a',(now() at time zone 'Asia/Kolkata')::date,'${crypto.randomUUID()}',${quote(qty)})`,staff).then(JSON.parse);
  await assert.rejects(load({veg:10,zz_unknown:1}),/Unknown stock item/);
  assert.equal(await request("select count(*) from cart_loadings where note='Opening stock transfer'",staff),'0');
  const results=await Promise.all([load({veg:10}),load({veg:20})]);
  assert.equal(results.filter(r=>r.status==='ok').length,1);
  assert.equal(results.filter(r=>r.status==='conflict').length,1);
  const qty=results.find(r=>r.status==='ok').record.quantities.veg;
  const inv=JSON.parse(await request('select app_inventory()',staff));
  assert.deepEqual(inv['test-a'].veg,{freezer:100-qty,cart:qty});
  assert.equal(await request("select count(*) from cart_loadings where note='Opening stock transfer'",staff),'1');
});

test('day-close serializer flags save and retry without duplicate reports', async () => {
  const after={id:880013,cart_id:'test-a',date:'2026-10-10',holiday:null,unrecorded:true,revenue:100};
  await sql('delete from day_close_logs where id=880013');
  const id=crypto.randomUUID();
  assert.equal((await mutate('row',{table:'day_close_logs',before:null,after},owner,id)).status,'ok');
  assert.equal((await mutate('row',{table:'day_close_logs',before:null,after},owner,id)).status,'ok');
  assert.equal(await sql('select count(*) from day_close_logs where id=880013 and unrecorded=true'),'1');
  await assert.rejects(mutate('row',{table:'day_close_logs',before:after,after:{...after,unrecorded:false}},other),/Not authorised/);
  await assert.rejects(mutate('row',{table:'day_close_logs',before:after,after:{...after,unrecorded:false}},staff),/Not authorised/);
  assert.equal((await mutate('row',{table:'day_close_logs',before:after,after:{...after,unrecorded:null}},owner)).status,'ok');
  await sql('delete from day_close_logs where id=880013');
});
