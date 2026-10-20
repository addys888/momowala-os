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
 delete from cart_loadings where id between 92901 and 92906;
 delete from wastage_logs where id between 92901 and 92906;
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
  await request("select app_assign_opening_manager('test-a',101,coalesce((select revision from cart_opening_managers where cart_id='test-a'),0))",owner);
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

test('two phones with the same staff account share committed orders and logout is independent', async () => {
  await sql("update staff set active=true,password_hash=app_hash('sync-test-password') where id=101");
  const login = async () => JSON.parse(await request("select app_login('9000000003','sync-test-password','team')"));
  const phoneA = await login(), phoneB = await login();
  assert.equal(phoneA.status, 'ok');
  assert.equal(phoneB.status, 'ok');
  assert.notEqual(phoneA.token, phoneB.token);
  try {
    const result = await mutate('order', { before: null, after: { ...order(91999), source: 'staff-entry', staff: 'Test Staff' } }, phoneA.token);
    assert.equal(result.status, 'ok');
    assert.equal(await request('select count(*) from orders where id=91999', phoneB.token), '1');
    assert.equal(await request('select count(*) from orders where id=91999', other), '0');
    await request('select app_logout()', phoneA.token);
    assert.equal(await request('select count(*) from orders where id=91999', phoneB.token), '1');
  } finally {
    await request('select app_logout()', phoneA.token);
    await request('select app_logout()', phoneB.token);
  }
});

const batch = async (commands, token=owner, id=crypto.randomUUID()) => JSON.parse(await request(`select app_mutate_batch('${id}',${quote(commands)})`,token));
test('stock movement and its audit record commit together and retry once', async () => {
  await sql("update inventory set data=jsonb_set(data,'{test-a,veg}','{\"freezer\":100,\"cart\":50}') where id=1");
  const commands=[{kind:'row',payload:{table:'cart_loadings',before:null,after:{id:92901,cart_id:'test-a',date:'2026-10-13',type:'CART_LOAD',item:'veg',qty:10}}},{kind:'inventory',payload:{cartId:'test-a',ops:{veg:{df:-10,dc:10}}}}];
  const id=crypto.randomUUID();
  assert.equal((await batch(commands,owner,id)).status,'ok');
  await batch(commands,owner,id);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'60');
  assert.equal(await sql('select count(*) from cart_loadings where id=92901'),'1');
  const rejected=structuredClone(commands);rejected[0].payload.after.id=92902;rejected[1].payload.ops.veg.df=-999;
  await assert.rejects(batch(rejected),/Not enough stock/);
  assert.equal(await sql('select count(*) from cart_loadings where id=92902'),'0');
  assert.equal(await sql("select data->'test-a'->'veg'->>'freezer' from inventory where id=1"),'90');
  await assert.rejects(batch(commands,other,id),/Not authorised/);
});
test('day close rejects duplicate dates and stale recounts without saving a partial report', async () => {
  await sql("delete from day_close_logs where cart_id='test-a' and date='2026-10-13'");
  const close=id=>({kind:'row',payload:{table:'day_close_logs',before:null,after:{id,cart_id:'test-a',date:'2026-10-13',revenue:750}}});
  const inventory={kind:'inventory',payload:{cartId:'test-a',ops:{veg:{df:60,cset:0}},expected:{veg:{freezer:90,cart:59}}}};
  await assert.rejects(batch([close(92903),inventory]),/stock changed/);
  assert.equal(await sql('select count(*) from day_close_logs where id=92903'),'0');
  inventory.payload.expected.veg.cart=60;
  await batch([close(92903),inventory]);
  await assert.rejects(batch([close(92904),inventory]),/already reconciled/);
  assert.equal(await sql("select data->'test-a'->'veg'->>'freezer' from inventory where id=1"),'150');
});
test('staff wastage remains atomic and cannot use a batch to change another cart', async () => {
  await sql("update inventory set data=jsonb_set(data,'{test-a,veg,cart}','20') where id=1");
  const commands=[{kind:'row',payload:{table:'wastage_logs',before:null,after:{id:92905,cart_id:'test-a',date:'2026-10-13',stock_key:'veg',qty:5,reason:'Damaged'}}},{kind:'inventory',payload:{cartId:'test-a',ops:{veg:{dc:-5}}}}];
  await batch(commands,staff);
  assert.equal(await sql("select data->'test-a'->'veg'->>'cart' from inventory where id=1"),'15');
  commands[0].payload.after.id=92906;commands[1].payload.cartId='test-b';
  await assert.rejects(batch(commands,staff),/Not authorised/);
  assert.equal(await sql('select count(*) from wastage_logs where id=92906'),'0');
});

test('opening manager assignment is owner-only, scoped and rejects stale replacement', async()=>{
  await sql("delete from cart_opening_managers where cart_id='test-a'; delete from opening_manager_audit where cart_id='test-a'; update staff set active=true where id=101");
  const assign=(id,revision,token=owner)=>request(`select app_assign_opening_manager('test-a',${id ?? 'null'},${revision})`,token).then(JSON.parse);
  await assert.rejects(assign(101,0,staff),/Not authorised/);
  await assert.rejects(assign(101,0,other),/Not authorised/);
  await assert.rejects(assign(99999,0),/active staff/);
  assert.equal((await assign(101,0)).status,'ok');
  assert.equal((await assign(null,0)).status,'conflict');
  assert.equal(await request('select count(*) from opening_manager_audit',staff),'0');
  assert.equal(await request("select count(*) from opening_manager_audit where cart_id='test-a'",owner),'1');
  await assert.rejects(request("update cart_opening_managers set staff_id=null",owner),/permission denied/);
  const status=()=>request("select app_opening_status('test-a',current_date)",staff).then(JSON.parse);
  assert.equal((await status()).canLoad,true);
  await assign(null,1);
  assert.equal((await status()).canLoad,false);
  await assert.rejects(request(`select app_load_opening_inventory('test-a',(now() at time zone 'Asia/Kolkata')::date,'${crypto.randomUUID()}','{"veg":1}')`,staff),/assigned active manager/);
  await assign(101,2);
});

test('owner confirmations are atomic, deduplicated, isolated and persistent', async()=>{
  await sql("delete from opening_loads where cart_id='test-a'; delete from opening_alerts where cart_id in ('test-a','test-b'); update inventory set data=jsonb_set(data,'{test-a,veg}','{\"freezer\":100,\"cart\":0}') where id=1");
  const id=crypto.randomUUID();
  const call=token=>request(`select app_load_opening_inventory('test-a',(now() at time zone 'Asia/Kolkata')::date,'${id}','{"veg":30}')`,token);
  await assert.rejects(call(owner),/only the assigned manager/);
  await call(staff);await call(staff);
  assert.equal(await request("select count(*) from opening_alerts where kind='completed'",owner),'1');
  assert.equal(await request('select count(*) from opening_alerts',staff),'0');
  assert.equal(await request('select count(*) from opening_alerts',other),'0');
  const alert=await sql("select id from opening_alerts where cart_id='test-a' and kind='completed'");
  await request(`select app_read_opening_alert(${alert})`,other);
  assert.equal(await sql(`select read_at is null from opening_alerts where id=${alert}`),'t');
  await request(`select app_read_opening_alert(${alert})`,owner);
  assert.equal(await sql(`select read_at is not null from opening_alerts where id=${alert}`),'t');
});

test('missed alerts occur at opening, survive late loads and midnight reminders use next business date', async()=>{
  await sql("delete from opening_alerts where cart_id='test-a'; delete from opening_loads where cart_id='test-a'; update carts set open_time='15:00' where id='test-a'");
  const collect=stamp=>sql(`select app_private.collect_opening_alerts('${stamp}+05:30')`);
  await collect('2026-10-20 14:29:00');
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a'"),'0');
  await collect('2026-10-20 14:30:00');
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a' and kind='manager_reminder'"),'1');
  await collect('2026-10-20 14:59:59');
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a' and kind='missed'"),'0');
  await Promise.all([collect('2026-10-20 15:00:00'),collect('2026-10-20 15:01:00')]);
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a' and kind='missed'"),'1');
  await sql("insert into opening_loads(cart_id,business_date,operation_id,quantities,actor_role,actor_name,created_at) values('test-a','2026-10-21',gen_random_uuid(),'{\"veg\":10}','staff','Test Staff','2026-10-21 15:01:00+05:30')");
  await collect('2026-10-21 15:02:00');
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a' and business_date='2026-10-21' and kind='missed'"),'1');
  await sql("update carts set open_time='00:15' where id='test-a'");
  await collect('2026-10-22 23:45:00');
  assert.equal(await sql("select count(*) from opening_alerts where cart_id='test-a' and business_date='2026-10-23' and kind='manager_reminder'"),'1');
  await sql("update carts set open_time='16:00' where id='test-a'; delete from opening_loads where cart_id='test-a'");
});

test('notification leases prevent concurrent sends and retry only failed devices', async()=>{
  await sql("delete from opening_alerts; delete from push_subscriptions; insert into app_private.backend_config values(1,encode(digest('local-notification-secret','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash; insert into opening_alerts(cart_id,business_date,kind,title,body) values('test-a',current_date,'completed','Loaded','Manager loaded 30 pieces'); insert into push_subscriptions(endpoint,cart_id,role,p256dh,auth) values('https://fcm.googleapis.com/test1','test-a','owner','key','auth'),('https://fcm.googleapis.com/test2','test-a','owner','key','auth'),('https://fcm.googleapis.com/other','test-b','owner','key','auth')");
  const backend=q=>sql(`begin; set local role anon; set local request.headers='{"x-backend-secret":"local-notification-secret"}'; ${q}; commit;`).then(out=>out.split('\n').filter(x=>!['BEGIN','SET','COMMIT',''].includes(x)).at(-1));
  await assert.rejects(request('select app_claim_opening_notifications()',owner),/Not authorised/);
  await assert.rejects(request("select app_private.collect_opening_alerts(now())",owner),/permission denied/);
  const claimed=await Promise.all([backend('select app_claim_opening_notifications()'),backend('select app_claim_opening_notifications()')]);
  const deliveries=claimed.flatMap(JSON.parse).filter(d=>d.title==='Loaded');
  assert.equal(deliveries.length,2);assert.equal(new Set(deliveries.map(d=>d.endpoint)).size,2);
  const d=deliveries[0];
  await backend(`select app_finish_opening_notification(${d.id},'${d.endpoint}','${d.lease}',true,false)`);
  await sql('update app_private.opening_deliveries set retry_at=now()');
  const retry=JSON.parse(await backend('select app_claim_opening_notifications()')).filter(d=>d.title==='Loaded');
  assert.equal(retry.length,1);assert.notEqual(retry[0].endpoint,d.endpoint);
  await sql('delete from push_subscriptions');
});

test('native completion delivery targets the submitting manager and owner with different modes', async()=>{
 await sql("delete from opening_alerts; delete from push_subscriptions; insert into opening_alerts(cart_id,business_date,kind,staff_id,title,body) values('test-a',current_date,'completed',101,'Native completion','Loaded'); insert into push_subscriptions(endpoint,cart_id,role,staff_id,p256dh) values('fcm:manager','test-a','staff',101,'binding'),('fcm:owner','test-a','owner',null,'binding'),('fcm:other','test-b','owner',null,'binding')");
 const raw=await sql(`begin; set local role anon; set local request.headers='{"x-backend-secret":"local-notification-secret"}'; select app_claim_opening_notifications(); commit;`);
 const records=JSON.parse(raw.split('\n').filter(x=>x.startsWith('[')).at(-1)).filter(x=>x.title==='Native completion');
 assert.equal(records.length,2);
 assert.equal(records.find(x=>x.endpoint==='fcm:manager').mode,'stock_complete');
 assert.equal(records.find(x=>x.endpoint==='fcm:owner').mode,'alert');
 assert(records.every(x=>x.cartId==='test-a' && x.date));
 await sql('delete from push_subscriptions');
});

test('legacy orders table gains split without changing existing order records', async () => {
  const {readFile}=await import('node:fs/promises');
  const migration=await readFile(new URL('../supabase/migrations/20261016090000_orders_split_compatibility.sql',import.meta.url),'utf8');
  const result=await sql(`begin;
    create temporary table saved_orders as select id,total,payment from orders;
    alter table orders drop column split;
    ${migration}
    select count(*) from saved_orders s full join orders o using(id) where s.id is null or o.id is null or s.total is distinct from o.total or s.payment is distinct from o.payment;
    select count(*) from information_schema.columns where table_schema='public' and table_name='orders' and column_name='split' and data_type='jsonb';
    rollback;`);
  assert.match(result,/\n0\n1\nROLLBACK$/);
});

test('update policy is readable but cannot be modified by an app client', async () => {
  assert.equal(await request('select minimum_version_code from android_update_policy'),'0');
  await assert.rejects(request('update android_update_policy set minimum_version_code=9999',owner),/permission denied/);
});

test('packing progress is server-backed, tenant-scoped and imports never overwrite newer ticks', async()=>{
 const date="(now() at time zone 'Asia/Kolkata')::date";
 await sql("delete from daily_packing where cart_id in ('test-a','test-b')");
 await request(`select app_save_packing('test-a',${date},'{"bag":true}')`,owner);
 assert.equal(await request("select checked from daily_packing where cart_id='test-a' and item_id='bag'",owner),'t');
 assert.equal(await request("select count(*) from daily_packing",other),'0');
 assert.equal(await request("select count(*) from daily_packing"),'0');
 await assert.rejects(request(`select app_save_packing('test-a',${date},'{"bag":false}')`,other),/Not authorised/);
 await assert.rejects(request(`select app_save_packing('test-a',${date},'{"bag":false}')`,staff),/Not authorised/);
 await assert.rejects(request(`select app_save_packing('test-a',${date},'{"bag":false}')`),/Not authorised/);
 await request(`select app_save_packing('test-a',${date},'{"spoon":true}')`,owner);
 assert.equal(await request("select count(*) from daily_packing where checked",owner),'2');
 await request(`select app_save_packing('test-a',${date},'{"bag":false}')`,owner);
 await request(`select app_save_packing('test-a',${date},'{"bag":true,"new":true}',true)`,owner);
 assert.equal(await request("select checked from daily_packing where item_id='bag'",owner),'f');
 await assert.rejects(request(`select app_save_packing('test-a',${date}-1,'{"bag":true}')`,owner),/Only today/);
 await assert.rejects(request(`select app_save_packing('test-a',${date},'{"bad":"yes"}')`,owner),/Invalid item/);
 await assert.rejects(request("update daily_packing set checked=true",owner),/permission denied/);
});

test('closing is owner-configured, manager-only, immutable and idempotent across phones',async()=>{
 await sql("delete from app_private.closing_deliveries; delete from closing_reports; delete from cart_closing_settings; update staff set active=true where id=101; insert into cart_opening_managers(cart_id,staff_id) values('test-a',101) on conflict(cart_id) do update set staff_id=101; update menus set data=jsonb_set(data,'{test-a,stockTypes}','[{\"key\":\"veg\",\"label\":\"Veg Momo\"},{\"key\":\"paneer\",\"label\":\"Paneer Momo\"}]') where id=1;");
 for(const token of [null,staff,other])await assert.rejects(request("select app_save_closing_settings('test-a',true,'22:00',0)",token),/Not authorised/);
 const cfg=JSON.parse(await request("select app_save_closing_settings('test-a',true,'22:00',0)",owner));assert.equal(cfg.closing_time,'22:00:00');
 await assert.rejects(request("select app_save_closing_settings('test-a',true,'21:00',0)",owner),/changed/);
 await assert.rejects(request("select app_save_closing_settings('test-a',true,'25:00',1)",owner),/valid closing time/);
 await sql("update cart_closing_settings set updated_at=now()-interval '2 days' where cart_id='test-a'; select app_private.collect_closing_reports(((now() at time zone 'Asia/Kolkata')::date+time '23:00') at time zone 'Asia/Kolkata','test-a');");
 const state=JSON.parse(await request("select app_closing_status('test-a')",staff));assert.equal(state.canSubmit,true);assert(state.reports.length>=1);
 const report=state.reports.find(r=>Date.parse(r.due_at)<Date.now());assert(report);
 for(const token of [null,other])await assert.rejects(request("select app_closing_status('test-a')",token),/Only the cart manager/);
 await assert.rejects(request('select * from closing_reports',staff),/permission denied/);
 const id=crypto.randomUUID();const submit=(cash=1234,quantities='{"veg":10,"paneer":0}',op=id)=>`select app_submit_closing('test-a',${report.id},'${op}',${cash},'${quantities}','Checked')`;
 for(const token of [owner,other,null])await assert.rejects(request(submit(),token),/Only the assigned/);
 await assert.rejects(request(submit(-1),staff),/valid cash/);
 await assert.rejects(request(submit(100,'{"veg":10}'),staff),/every stock/);
 await assert.rejects(request(submit(100,'{"veg":0.5,"paneer":0}'),staff),/whole pieces/);
 await sql('update staff set active=false where id=101');await assert.rejects(request(submit(),staff),/Only the assigned/);await sql('update staff set active=true where id=101');
 const result=JSON.parse(await request(submit(),staff));assert.equal(result.cash_count,1234);assert.equal(result.quantities.paneer,0);
 const retry=JSON.parse(await request(submit(),staff));assert.equal(retry.submitted_at,result.submitted_at);
 await assert.rejects(request(submit(999),staff),/already submitted/);
 const ownerView=JSON.parse(await request("select app_closing_status('test-a')",owner));assert.equal(ownerView.reports.find(r=>r.id===report.id).cash_count,1234);
 await assert.rejects(request(`select app_ack_closing('test-a',${report.id})`,staff),/Not authorised/);
 await request(`select app_ack_closing('test-a',${report.id})`,owner);
 assert(JSON.parse(await request("select app_closing_status('test-a')",owner)).reports.find(r=>r.id===report.id).owner_read_at);
});

test('closing notifications lease independently, route by manager and send durable stops',async()=>{
 await sql(`delete from app_private.closing_deliveries; delete from closing_reports; delete from push_subscriptions;
 insert into app_private.backend_config values(1,encode(digest('local-notification-secret','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash;
 update cart_closing_settings set enabled=true,updated_at=now() where cart_id='test-a';
 insert into closing_reports(cart_id,business_date,due_at,stock_types) values('test-a',current_date,now()-interval '1 hour','[]');
 insert into push_subscriptions(endpoint,cart_id,role,staff_id,p256dh,auth) values('fcm:closing-manager','test-a','staff',101,'binding',''),('fcm:closing-otherstaff','test-a','staff',999,'binding',''),('fcm:closing-owner','test-a','owner',null,'binding',''),('fcm:closing-outsider','test-b','owner',null,'binding','');`);
 const backend=async q=>{const raw=await sql(`begin;set local role anon;set local request.headers='{"x-backend-secret":"local-notification-secret"}';${q};commit;`);return raw.split('\n').filter(x=>x.startsWith('[')).at(-1);};
 await assert.rejects(request('select app_claim_closing_notifications()',owner),/Not authorised/);
 const claimed=JSON.parse(await backend('select app_claim_closing_notifications()'));assert.equal(claimed.length,1);assert.equal(claimed[0].endpoint,'fcm:closing-manager');assert.equal(claimed[0].mode,'closing_due');
 assert.equal(JSON.parse(await backend('select app_claim_closing_notifications()')).length,0);
 const d=claimed[0];await backend(`select app_finish_closing_notification(${d.id},'${d.endpoint}','${d.tag}','${d.lease}',true)`);
 await request(`select app_submit_closing('test-a',${d.id},'${crypto.randomUUID()}',0,'{}')`,staff);
 const next=JSON.parse(await backend('select app_claim_closing_notifications()'));
 assert.equal(next.find(x=>x.endpoint==='fcm:closing-manager').mode,'closing_stop');assert.equal(next.find(x=>x.endpoint==='fcm:closing-owner').mode,'closing_report');assert.equal(next.length,2);
 await request(`select app_ack_closing('test-a',${d.id})`,owner);
 const ack=JSON.parse(await backend('select app_claim_closing_notifications()'));assert.equal(ack.find(x=>x.endpoint==='fcm:closing-owner').mode,'closing_stop');
 // A provider response for an obsolete lease cannot mark a newer cancellation as delivered.
 const ownerPush=next.find(x=>x.mode==='closing_report');await backend(`select app_finish_closing_notification(${d.id},'${ownerPush.endpoint}','${ownerPush.tag}','${ownerPush.lease}',true)`);
 assert.equal(await sql(`select sent_at is null from app_private.closing_deliveries where report_id=${d.id} and endpoint='fcm:closing-owner'`),'t');
 await sql('delete from push_subscriptions');
});

test('closing reassignment and disabling cancel old phones; midnight collection deduplicates',async()=>{
 await sql(`delete from app_private.closing_deliveries; delete from closing_reports; delete from push_subscriptions;
 insert into staff(id,cart_id,name,mobile,active) values(102,'test-a','Replacement','9000000004',true) on conflict(id) do update set active=true;
 update cart_opening_managers set staff_id=101 where cart_id='test-a';
 update cart_closing_settings set enabled=true,closing_time='00:05',updated_at='2030-01-01 00:00+05:30' where cart_id='test-a';
 select app_private.collect_closing_reports('2030-01-02 00:04+05:30','test-a');`);
 assert.equal(await sql("select count(*) from closing_reports where business_date='2030-01-02'"),'0');
 await sql("select app_private.collect_closing_reports('2030-01-02 00:06+05:30','test-a');select app_private.collect_closing_reports('2030-01-02 00:07+05:30','test-a');");
 assert.equal(await sql("select count(*) from closing_reports where business_date='2030-01-02'"),'1');
 await sql(`delete from closing_reports;update cart_closing_settings set updated_at=now() where cart_id='test-a';insert into closing_reports(cart_id,business_date,due_at,stock_types) values('test-a',current_date,now()-interval '1 hour','[]');
 insert into push_subscriptions(endpoint,cart_id,role,staff_id,p256dh,auth) values('fcm:old','test-a','staff',101,'binding',''),('fcm:new','test-a','staff',102,'binding','');`);
 const claim=async()=>{const out=await sql(`begin;set local role anon;set local request.headers='{"x-backend-secret":"local-notification-secret"}';select app_claim_closing_notifications();commit;`);return JSON.parse(out.split('\n').find(x=>x.startsWith('[')));};
 const old=(await claim())[0];assert.equal(old.endpoint,'fcm:old');
 const revision=await sql("select revision from cart_opening_managers where cart_id='test-a'");await request(`select app_assign_opening_manager('test-a',102,${revision})`,owner);
 await assert.rejects(request(`select app_submit_closing('test-a',${old.id},'${crypto.randomUUID()}',0,'{}')`,staff),/Only the assigned/);
 const reassigned=await claim();assert(reassigned.some(x=>x.endpoint==='fcm:old'&&x.mode==='closing_stop'));assert(reassigned.some(x=>x.endpoint==='fcm:new'&&x.mode==='closing_due'));
 const cfg=await sql("select revision from cart_closing_settings where cart_id='test-a'");await request(`select app_save_closing_settings('test-a',false,'22:00',${cfg})`,owner);
 assert((await claim()).some(x=>x.endpoint==='fcm:new'&&x.mode==='closing_stop'));
 await sql('delete from push_subscriptions');
});

test('manager property is derived, scoped and follows reassignment/deactivation',async()=>{
 await sql("update carts set open_time='15:00' where id='test-a'; update staff set active=true where id in (101,102); update cart_opening_managers set staff_id=101 where cart_id='test-a'");
 assert.equal(await request('select is_manager from staff where id=101',owner),'t');
 assert.equal(await request('select count(*) from staff where is_manager',other),'0');
 await assert.rejects(request('update staff set is_manager=true where id=102',staff),/permission denied/);
 await sql('update staff set is_manager=true where id=102');
 assert.equal(await sql('select is_manager from staff where id=102'),'f');
 await sql("update cart_opening_managers set staff_id=102 where cart_id='test-a'");
 assert.equal(await sql('select is_manager from staff where id=101'),'f');
 assert.equal(await sql('select is_manager from staff where id=102'),'t');
 await sql('update staff set active=false where id=102');
 assert.equal(await sql('select is_manager from staff where id=102'),'f');
 await sql("update cart_opening_managers set staff_id=101 where cart_id='test-a'");
});

test('daily reset archives all food counts, preserves freezer/supplies and runs once across concurrent reads',async()=>{
 await sql(`delete from cart_stock_rollovers where cart_id='test-a';
 update inventory set data=jsonb_set(data,'{test-a}','{"veg":{"freezer":500,"cart":27},"paneer":{"freezer":200,"cart":19},"corn":{"freezer":100,"cart":8},"consumables":{"plates":50}}');
 insert into app_private.inventory_days values('test-a',app_private.stock_business_date('test-a')-1) on conflict(cart_id) do update set business_date=excluded.business_date;`);
 const reads=await Promise.all([request('select app_inventory()',owner),request('select app_inventory()',staff)]);
 for(const read of reads){const inv=JSON.parse(read)['test-a'];assert.equal(inv.veg.cart,0);assert.equal(inv.paneer.cart,0);assert.equal(inv.corn.cart,0);assert.equal(inv.veg.freezer,500);assert.deepEqual(inv.consumables,{plates:50});}
 assert.equal(await sql("select count(*) from cart_stock_rollovers where cart_id='test-a'"),'1');
 assert.deepEqual(JSON.parse(await request("select quantities from cart_stock_rollovers where cart_id='test-a'",owner)),{veg:27,paneer:19,corn:8});
 assert.equal(await request("select count(*) from cart_stock_rollovers where cart_id='test-a'",other),'0');
 await assert.rejects(request("select app_private.roll_all_stock_days()",staff),/permission denied/);
});

test('opening load rolls first, never carries leftovers, deduplicates phones and remains saved for the day',async()=>{
 await sql(`delete from opening_loads where cart_id='test-a';delete from opening_alerts where cart_id='test-a';delete from cart_stock_rollovers where cart_id='test-a';
 update inventory set data=jsonb_set(data,'{test-a,veg,cart}','21');update app_private.inventory_days set business_date=app_private.stock_business_date('test-a')-1 where cart_id='test-a';`);
 const d=await sql("select app_private.stock_business_date('test-a')"),id=crypto.randomUUID();
 const load=()=>request(`select app_load_opening_inventory('test-a','${d}','${id}','{"veg":40}')`,staff);
 const loads=await Promise.all([load(),load()]);assert(loads.every(r=>JSON.parse(r).status==='ok'));
 const inv=JSON.parse(await request('select app_inventory()',owner))['test-a'];assert.equal(inv.veg.cart,40);assert.equal(inv.veg.freezer,460);assert.equal(inv.paneer.cart,0);
 const status=JSON.parse(await request("select app_opening_status('test-a',null)",staff));assert.equal(status.isManager,true);assert.equal(status.businessDate,d);assert.equal(status.record.quantities.veg,40);
 assert.equal(JSON.parse(await request(`select app_load_opening_inventory('test-a','${d}','${crypto.randomUUID()}','{"veg":50}')`,staff)).status,'conflict');
 assert.equal(JSON.parse(await request('select app_inventory()',staff))['test-a'].veg.cart,40);
});

test('rollover fallback precedes writes and old cancellations cannot restore discarded food',async()=>{
 await sql(`delete from cart_stock_rollovers where cart_id='test-a';update app_private.inventory_days set business_date=app_private.stock_business_date('test-a')-1 where cart_id='test-a';
 update inventory set data=jsonb_set(data,'{test-a,veg,cart}','20');select app_private.inventory_delta('test-a','{"veg":{"dc":10}}');`);
 assert.equal(JSON.parse(await request('select app_inventory()',owner))['test-a'].veg.cart,10);
 const created=await mutate('order',{before:null,after:{...order(99991),source:'staff-entry',payment:'pending'}});
 await sql("update orders set stock_business_date=app_private.stock_business_date('test-a')-1 where id=99991");
 const before=JSON.parse(await request('select app_inventory()',owner))['test-a'].veg.cart;
 const cancelled=await mutate('order',{before:created.order,after:{...created.order,payment:'cancelled',cancel_reason:'Yesterday no-show'}},owner);
 assert.equal(cancelled.status,'ok');assert.equal(JSON.parse(await request('select app_inventory()',owner))['test-a'].veg.cart,before);
 assert.equal(await sql("select app_private.stock_business_date('test-a','2030-01-02 00:00+05:30')"),'2030-01-02');
 await sql("update carts set open_time='00:10' where id='test-a'");
 assert.equal(await sql("select app_private.stock_business_date('test-a','2030-01-01 23:39+05:30')"),'2030-01-01');
 assert.equal(await sql("select app_private.stock_business_date('test-a','2030-01-01 23:40+05:30')"),'2030-01-02');
 await sql("update carts set open_time='15:00' where id='test-a'");
});

test('first closing setup returns usable defaults and can be saved by the owner',async()=>{
 await sql("delete from cart_closing_settings where cart_id='test-a';update staff set active=true where id=101;update cart_opening_managers set staff_id=101 where cart_id='test-a'");
 const status=JSON.parse(await request("select app_closing_status('test-a')",owner));
 assert.deepEqual(status.settings,{enabled:false,closing_time:'22:00:00',revision:0});
 const saved=JSON.parse(await request("select app_save_closing_settings('test-a',true,'22:00',0)",owner));
 assert.equal(saved.enabled,true);assert.equal(saved.revision,1);
 await assert.rejects(request("select app_save_closing_settings('test-a',false,'22:00',0)",owner),/changed/);
 await assert.rejects(request("select app_save_closing_settings('test-a',false,'22:00',1)",staff),/Not authorised/);
});

const dailyCosts={'Room rent + electricity':150,'Labour (300 + 300 + 200)':800,'Fresh cream':100,Mayo:70,Oil:200,Gas:200,Disposal:200,Veggies:100,'Mocktail supplies':50,Coal:30,Butter:50,'Packing supplies':50,Other:100};
const profitDay=async(d,token=owner)=>JSON.parse(await request(`select app_profit_day('test-a','${d}')`,token));
test('profit waits for a confirmed close; first cost setup is owner-scoped',async()=>{
 await sql("delete from day_close_logs where cart_id='test-a' and date>='2090-01-01';delete from closing_reports where cart_id='test-a' and business_date>='2090-01-01';delete from daily_profit_reports where cart_id='test-a';delete from cart_cost_profiles where cart_id='test-a';delete from cart_loadings where cart_id='test-a' and date>='2090-01-01'");
 assert.equal(Object.values(dailyCosts).reduce((s,n)=>s+n,0),2100);
 const call=`select app_save_cost_profile('test-a','2090-01-01','{"veg":3,"paneer":5,"corn":5}',${quote(dailyCosts)},0)`;
 await assert.rejects(request(call,staff),/Not authorised/);await assert.rejects(request(call,other),/Not authorised/);
 await request(call,owner);
 await sql(`insert into cart_loadings(id,cart_id,date,type,item,qty) values(909001,'test-a','2090-01-01','CART_LOAD','veg',100),(909002,'test-a','2090-01-01','CART_LOAD','paneer',50),(909003,'test-a','2090-01-01','CART_LOAD','corn',20);
 insert into orders(id,cart_id,date,time,token,items,total,payment,stock_usage,stock_deducted) values(909001,'test-a','2090-01-01','12:00','P1','[]',2000,'cash','{"veg":20,"paneer":10,"corn":5}',true)`);
 assert.equal((await profitDay('2090-01-01')).report,null);
 await assert.rejects(profitDay('2090-01-01',staff),/Not authorised/);await assert.rejects(profitDay('2090-01-01',other),/Not authorised/);
});
test('manager closing automatically calculates sold cost, 2100 overhead, and separate unsold value',async()=>{
 await sql(`insert into closing_reports(cart_id,business_date,due_at,stock_types,submitted_at,quantities) values('test-a','2090-01-01',now(),'[]',now(),'{"veg":80,"paneer":40,"corn":15}')`);
 assert.equal(await sql("select result->>'status' from daily_profit_reports where cart_id='test-a' and business_date='2090-01-01'"),'ready');
 const r=(await profitDay('2090-01-01')).report.result;
 assert.equal(r.status,'ready');assert.equal(r.sales,2000);assert.equal(r.soldCost,135);assert.equal(r.overhead,2100);assert.equal(r.profit,-235);assert.equal(r.unsoldValue,515);assert.equal(r.loadedCost,650);assert.equal(r.preparationCost,2750);assert.equal(r.source,'manager_closing');
 assert.equal(r.rows.find(x=>x.key==='veg').loaded,100);assert.equal(r.rows.find(x=>x.key==='veg').variance,0);
 assert.equal(await request("select count(*) from daily_profit_reports where cart_id='test-a'",other),'0');
});
test('purchase expenses are not charged twice; paid-order corrections refresh profit with frozen rates',async()=>{
 const before=(await profitDay('2090-01-01')).report;
 await sql("insert into expenses(id,cart_id,date,category,amount) values(909001,'test-a','2090-01-01','Frozen momo stock',10000) on conflict(id) do update set amount=excluded.amount");
 assert.equal((await profitDay('2090-01-01')).report.result.profit,-235);
 await request(`select app_save_cost_profile('test-a','2090-01-01','{"veg":9,"paneer":9,"corn":9}','{"Daily":1}',1)`,owner);
 assert.equal((await profitDay('2090-01-01')).report.result.profit,-235);
 await sql("insert into orders(id,cart_id,date,time,token,items,total,payment,stock_usage,stock_deducted) values(909002,'test-a','2090-01-01','12:01','P2','[]',100,'pending','{\"veg\":5}',true)");
 let r=(await profitDay('2090-01-01')).report.result;assert.equal(r.profit,-235);assert.equal(r.pendingSales,100);
 await sql("update orders set payment='upi' where id=909002");r=(await profitDay('2090-01-01')).report.result;assert.equal(r.profit,-150);assert.equal(r.soldCost,150);
 await sql("update orders set payment='cancelled' where id=909002");r=(await profitDay('2090-01-01')).report.result;assert.equal(r.profit,-235);
 assert((await profitDay('2090-01-01')).report.revision>before.revision);
});
test('owner reconciliation also finalizes profit; manual-only revenue never invents sold pieces',async()=>{
 await sql(`insert into day_close_logs(id,cart_id,date,closed_at,physical_cash,phonepe_amount,stock) values(909002,'test-a','2090-01-02',now(),0,0,'[{"key":"veg","actual":0}]')`);
 let r=(await profitDay('2090-01-02')).report.result;assert.equal(r.status,'ready');assert.equal(r.profit,-1);assert.equal(r.source,'reconciliation');
 await sql("update day_close_logs set unrecorded=true,physical_cash=5000 where id=909002");r=(await profitDay('2090-01-02')).report.result;assert.equal(r.status,'incomplete');assert.equal(r.profit,null);assert.equal(r.countedCollections,5000);
 await sql("insert into day_close_logs(id,cart_id,date,closed_at,holiday) values(909003,'test-a','2090-01-03',now(),true)");r=(await profitDay('2090-01-03')).report.result;assert.equal(r.status,'holiday');assert.equal(r.overhead,0);
});
test('missing cost rates block final profit and can be supplied without losing reports',async()=>{
 await sql("insert into orders(id,cart_id,date,time,token,items,total,payment,stock_usage) values(909004,'test-a','2090-01-04','12:00','P4','[]',100,'cash','{\"newfood\":2}');insert into day_close_logs(id,cart_id,date,closed_at) values(909004,'test-a','2090-01-04',now())");
 let r=(await profitDay('2090-01-04')).report.result;assert.equal(r.status,'incomplete');assert.equal(r.profit,null);assert.equal(r.missingRates,true);
 await request("select app_save_cost_profile('test-a','2090-01-04','{\"newfood\":4}','{\"Daily\":10}',0)",owner);
 r=(await profitDay('2090-01-04')).report.result;assert.equal(r.profit,82);
 await assert.rejects(request("select app_save_cost_profile('test-a','2090-01-04','{\"newfood\":-1}','{\"Daily\":10}',1)",owner),/nonnegative/);
 await assert.rejects(request("select app_save_cost_profile('test-a','2090-01-04','{\"newfood\":4}','{\"Daily\":10}',0)",owner),/changed/);
});

test('concurrent late sales refresh one report without weakening permissions',async()=>{
 await Promise.all([sql("update orders set total=2100 where id=909001"),sql("update orders set payment='cash' where id=909002")]);
 const r=(await profitDay('2090-01-01',admin)).report.result;
 assert.equal(r.sales,2200);assert.equal(r.soldCost,150);assert.equal(r.profit,-50);
 await assert.rejects(request("select app_private.refresh_daily_profit('test-a','2090-01-01')",staff),/permission denied/);
 await assert.rejects(request("update daily_profit_reports set result='{}' where cart_id='test-a'",owner),/permission denied/);
});

test('variable supplies scale from 500 veg + 300 paneer + 40 corn; fixed daily costs stay 950',async()=>{
 const fixed={'Room rent + electricity':150,'Labour (300 + 300 + 200)':800};
 const variable=Object.fromEntries(Object.entries(dailyCosts).filter(([k])=>!(k in fixed)));
 await sql("delete from day_close_logs where cart_id='test-a' and date>='2091-01-01';delete from daily_profit_reports where cart_id='test-a' and business_date>='2091-01-01';delete from cart_cost_profiles where cart_id='test-a' and effective_from>='2091-01-01'");
 await request(`select app_save_cost_profile('test-a','2091-01-01','{"veg":3,"paneer":5,"corn":5}',${quote(fixed)},0,${quote(variable)},'{"veg":500,"paneer":300,"corn":40}')`,owner);
 for(const [i,factor] of [0,0.5,1,2].entries()){
  const day=`2091-01-0${i+1}`,id=919100+i,usage={veg:500*factor,paneer:300*factor,corn:40*factor};
  await sql(`insert into orders(id,cart_id,date,time,token,items,total,payment,stock_usage) values(${id},'test-a','${day}','12:00','S${i}','[]',${10000*factor},'cash',${quote(usage)});insert into day_close_logs(id,cart_id,date,closed_at,stock) values(${id},'test-a','${day}',now(),'[]')`);
  const r=(await profitDay(day)).report.result;
  assert.equal(r.referencePieces,840);assert.equal(r.soldReferencePieces,840*factor);assert.equal(r.fixedTotal,950);assert.equal(r.variableCosts.Oil,200*factor);assert.equal(r.variableCosts['Fresh cream'],100*factor);assert.equal(r.variableTotal,1150*factor);assert.equal(r.profit,10000*factor-3200*factor-950-1150*factor);
 }
 await assert.rejects(request(`select app_save_cost_profile('test-a','2091-01-05','{"veg":3}','{}',0,'{"Oil":200}','{"veg":0}')`,owner),/greater than zero/);
});
