import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sql=q=>execFileSync('psql',['-h','127.0.0.1','-p','55439','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
const manager='b1111111-1111-4111-8111-111111111111',owner='b2222222-2222-4222-8222-222222222222',other='b3333333-3333-4333-8333-333333333333';
const auth=t=>`set local role anon;set local request.headers='{"x-app-session":"${t}"}';`;
const seed=`insert into carts(id,name,active,open_time) values('meal-test','Meal Test',true,'15:00');
insert into staff(id,cart_id,name,mobile,active) values(99201,'meal-test','Manager','9000099201',true),(99202,'meal-test','Team','9000099202',true);
insert into cart_opening_managers(cart_id,staff_id) values('meal-test',99201);
insert into cart_closing_settings(cart_id,enabled,closing_time,updated_at) values('meal-test',true,'22:00',now()-interval '2 days');
insert into app_sessions(token,role,cart_id,name,staff_id,expires_at) values('${manager}','staff','meal-test','Manager',99201,now()+interval '1 day'),('${owner}','owner','meal-test','Owner',null,now()+interval '1 day'),('${other}','staff','meal-test','Team',99202,now()+interval '1 day');
update menus set data=jsonb_set(data,'{meal-test}','{"stockTypes":[{"key":"veg","label":"Veg"}],"items":[]}');
update inventory set data=jsonb_set(data,'{meal-test}','{"veg":{"cart":100,"freezer":100}}');
insert into app_private.inventory_days values('meal-test',app_private.stock_business_date('meal-test'));
insert into opening_loads(cart_id,business_date,operation_id,quantities,actor_role,actor_name) values('meal-test',app_private.stock_business_date('meal-test'),'b4444444-4444-4444-8444-444444444444','{"veg":100}','staff','Manager');
insert into closing_reports(id,cart_id,business_date,due_at,stock_types) overriding system value values(8999921,'meal-test',app_private.stock_business_date('meal-test'),now()-interval '30 minutes','[{"key":"veg","label":"Veg"}]');`;
const run=q=>sql(`begin;${seed}${q};rollback;`).split('\n').filter(s=>s.startsWith('{')||s.startsWith('['));
const meal=(qty=8,op='b5555555-5555-4555-8555-555555555555')=>`select app_log_staff_meal('meal-test',app_private.stock_business_date('meal-test'),'${op}',99202,'veg',${qty})`;
// Resolve the business date before assuming the restricted role.
const day=sql("select app_private.stock_business_date('test-a')");
const mealCall=(qty=8)=>meal(qty).replace("app_private.stock_business_date('meal-test')",`'${day}'`);
test('manager meal is idempotent, deducts stock once, and rolls up pieces',()=>{
 const rows=run(`${auth(manager)}${mealCall()};${mealCall()};select app_staff_meals('meal-test','${day}');select app_inventory()`);
 const meals=JSON.parse(rows[2]);assert.equal(meals.total,8);assert.equal(meals.items.length,1);assert.equal(JSON.parse(rows[3])['meal-test'].veg.cart,92);
});
test('meal rejects non-manager, invalid quantity and unknown staff without mutation',()=>{
 assert.throws(()=>run(`${auth(other)}${mealCall()}`),/Only the assigned/);
 for(const qty of [0,11])assert.throws(()=>run(`${auth(manager)}${mealCall(qty)}`),/1 to 10/);
 assert.throws(()=>run(`${auth(manager)}${mealCall().replace("99202,'veg'","99999,'veg'")}`),/active staff/);
});
test('closing discrepancy submits without notes; only owner receives the expected count',()=>{
 const rows=run(`${auth(manager)}select app_submit_closing_checked('meal-test',8999921,'b6666666-6666-4666-8666-666666666666',100,'{"veg":7}',null,'');select app_closing_status('meal-test');${auth(owner)}select app_closing_status('meal-test')`);
 assert.equal(JSON.parse(rows[0]).quantities.veg,7);assert.equal('expected_quantities' in JSON.parse(rows[0]),false);
 assert.equal('expected_quantities' in JSON.parse(rows[1]).reports.find(r=>r.id===8999921),false);
 assert.equal(JSON.parse(rows[2]).reports.find(r=>r.id===8999921).expected_quantities.veg,100);
});
test('mark all read clears own badge, preserves history and other audience',()=>{
 const rows=run(`insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target) values('meal-test','staff','meal-staff','announcement','Hi','Hi','inbox');${auth(owner)}select app_read_all_partner_notifications('meal-test',9223372036854775807);select app_partner_inbox('meal-test');${auth(manager)}select app_partner_inbox('meal-test')`);
 assert.equal(JSON.parse(rows[0]).unread,0);assert.ok(JSON.parse(rows[0]).items.length>0);assert.equal(JSON.parse(rows[1]).unread,1);
});
test('leave suppresses reminder keys; otherwise ten-minute slot changes reminder identity',()=>{
 const rows=run(`${auth(manager)}select app_closing_status('meal-test');reset role;update closing_reports set due_at=due_at-interval '10 minutes' where id=8999921;${auth(manager)}select app_closing_status('meal-test');reset role;insert into staff_hr(staff_id,cart_id,details) values(99201,'meal-test',jsonb_build_object('daysOff',jsonb_build_object('${day}',jsonb_build_object('type','leave','duration',1))));${auth(manager)}select app_closing_status('meal-test')`);
 const keys=rows.map(s=>JSON.parse(s).reports.find(r=>r.id===8999921).reminderKey);assert.ok(keys[0]);assert.notEqual(keys[0],keys[1]);assert.equal(keys[2],null);
});
test('staff meals appear separately in owner profit and explain stock variance',()=>{
 const rows=run(`insert into cart_loadings(id,cart_id,date,time,type,item,qty,note) values(8999930,'meal-test','${day}','15:00','CART_LOAD','veg',100,'Opening');insert into cart_cost_profiles(cart_id,effective_from,rates,daily_costs) values('meal-test','${day}','{"veg":3}','{}');${auth(manager)}${mealCall()};select app_submit_closing_checked('meal-test',8999921,'b6666666-6666-4666-8666-666666666666',0,'{"veg":92}',null,'');${auth(owner)}select app_profit_day('meal-test','${day}')`);
 const r=JSON.parse(rows.at(-1)).report.result;assert.equal(r.staffMealCost,24);assert.equal(r.profit,-24);assert.equal(r.rows[0].staffMeals,8);assert.equal(r.rows[0].expected,92);assert.equal(r.rows[0].variance,0);
});
test('push claims use new ten-minute identities, suppress leave and stop after submission',()=>{
 const backend=`reset role;insert into app_private.backend_config values(1,encode(digest('meal-test-secret','sha256'),'hex')) on conflict(id) do update set secret_hash=excluded.secret_hash;set local role anon;set local request.headers='{"x-backend-secret":"meal-test-secret"}';`;
 const rows=run(`insert into push_subscriptions(endpoint,cart_id,role,staff_id,p256dh,auth) values('fcm:meal-fixture','meal-test','staff',99201,'binding','');${backend}select app_claim_closing_notifications();select app_claim_closing_notifications();reset role;insert into staff_hr(staff_id,cart_id,details) values(99201,'meal-test',jsonb_build_object('daysOff',jsonb_build_object('${day}',jsonb_build_object('type','leave','duration',1))));${backend}select app_claim_closing_notifications();`);
 const own=rows.map(s=>JSON.parse(s).filter(d=>d.cartId==='meal-test'));
 assert.ok(own[0].some(d=>d.mode==='closing_due'&&d.tag.startsWith('closing-manager-8999921-')));assert.equal(own[1].length,0);assert.ok(own[2].some(d=>d.mode==='closing_stop'));assert.equal(own[2].some(d=>d.mode==='closing_due'),false);
});
