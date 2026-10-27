import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sql=q=>execFileSync('psql',['-h','127.0.0.1','-p','55439','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
const owner='a1111111-1111-4111-8111-111111111111',staff='a2222222-2222-4222-8222-222222222222',other='a3333333-3333-4333-8333-333333333333';
const request=(q,token=owner)=>sql(`begin;set local role anon;set local request.headers='{"x-app-session":"${token}"}';${q};rollback;`).split('\n').filter(x=>!['BEGIN','SET','ROLLBACK',''].includes(x)).at(-1);
sql(`insert into carts(id,name,active) values('inbox-test-a','Inbox A',true),('inbox-test-b','Inbox B',true) on conflict do nothing;
insert into staff(id,cart_id,name,mobile,active) values(99101,'inbox-test-a','Inbox Staff','9000099101',true) on conflict do nothing;
insert into app_sessions(token,role,cart_id,name,staff_id,expires_at) values('${owner}','owner','inbox-test-a','Owner',null,now()+interval '1 day'),('${staff}','staff','inbox-test-a','Inbox Staff',99101,now()+interval '1 day'),('${other}','owner','inbox-test-b','Other',null,now()+interval '1 day') on conflict(token) do update set expires_at=excluded.expires_at;
insert into orders(id,cart_id,date,time,token,items,total,payment,source,staff) select 8900000+n,'inbox-test-a','2026-10-25','18:30','T'||n,'[]',0,'cash','staff-entry','Inbox Staff' from generate_series(1,1105) n on conflict(id) do nothing;`);
test('bootstrap returns every committed order beyond 1000 with tenant isolation and no credentials',()=>{
 const result=JSON.parse(request('select app_partner_bootstrap()'));
 assert.equal(result.orders.length,1105);
 assert.ok(result.orders.every(o=>o.cart_id==='inbox-test-a'));
 assert.ok(result.carts.every(c=>c.id==='inbox-test-a'));
 assert.equal(JSON.stringify(result).includes('password_hash'),false);
 assert.equal(JSON.parse(request('select app_partner_bootstrap()',other)).orders.length,0);
 assert.throws(()=>request('select app_partner_bootstrap()','00000000-0000-4000-8000-000000000000'),/Sign in required/);
});
sql(`insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target) select 'inbox-test-a','owner','ops-fixture:'||n,'refill','Stock refilled','Fixture','stock' from generate_series(1,60) n on conflict do nothing;`);

test('inbox paginates committed events and blocks cross-cart reads',()=>{
 const page=JSON.parse(request("select app_partner_inbox('inbox-test-a')"));
 assert.equal(page.items.length,30);assert.ok(page.unread>=60);assert.ok(page.items.every(n=>!['order','cancel','payment'].includes(n.kind)));
 const older=JSON.parse(request(`select app_partner_inbox('inbox-test-a',${page.items.at(-1).id})`));
 assert.equal(older.items.length,30);assert.ok(older.items.every(n=>n.id<page.items.at(-1).id));
 assert.throws(()=>request("select app_partner_inbox('inbox-test-a')",other),/Not authorised/);
 assert.equal(JSON.parse(request("select app_partner_inbox('inbox-test-a')",staff)).items.length,0);
});
test('announcement is owner-only, idempotent, and staff read acknowledgement is server-side',()=>{
 const operation='a4444444-4444-4444-8444-444444444444';
 const result=sql(`begin;set local role anon;set local request.headers='{"x-app-session":"${owner}"}';select app_publish_announcement('inbox-test-a','${operation}','Tomorrow','Arrive at 2 PM');select app_publish_announcement('inbox-test-a','${operation}','Tomorrow','Arrive at 2 PM');set local request.headers='{"x-app-session":"${staff}"}';select app_partner_inbox('inbox-test-a');rollback;`).split('\n');
 const inbox=JSON.parse(result.find(l=>l.startsWith('{')));
 assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].title,'Tomorrow');
 assert.throws(()=>request(`select app_publish_announcement('inbox-test-a','${operation}','Title','Body')`,staff),/Not authorised/);
 const id=JSON.parse(request("select app_partner_inbox('inbox-test-a')")).items[0].id;
 const read=JSON.parse(request(`select app_read_partner_notification(${id});select app_partner_inbox('inbox-test-a')`));
 assert.equal(read.items.find(n=>n.id===id).is_read,true);
 assert.throws(()=>request(`select app_read_partner_notification(${id})`,other),/Not authorised/);
});
test('push claiming cannot be invoked by a logged-in owner',()=>{
 assert.throws(()=>request('select app_claim_partner_notifications()'),/Not authorised/);
});
test('recovered prior-day sale retains its date without deducting current-day stock; replay is idempotent',()=>{
 const id=8999991,op='a5555555-5555-4555-8555-555555555555';
 const payload=JSON.stringify({before:null,after:{id,cart_id:'test-a',date:'2026-10-10',time:'20:30',token:'Waiting to sync',items:[{id:'veg',name:'Veg Full',type:'full',price:70,qty:1}],total:70,payment:'cash',source:'staff-entry',staff:'Test Staff'}});
 const result=sql(`begin;
 update app_sessions set expires_at=now()+interval '1 day' where token='22222222-2222-4222-8222-222222222222';
 update menus set data=jsonb_set(data,'{test-a}', '{"items":[{"id":"veg","name":"Veg","half":35,"full":70,"pcsHalf":5,"pcsFull":10,"stockKey":"veg"}],"lassi":[],"addons":[]}');
 update inventory set data=jsonb_set(data,'{test-a}', '{"veg":{"freezer":100,"cart":100}}');
 insert into app_private.inventory_days values('test-a',app_private.stock_business_date('test-a')) on conflict(cart_id) do update set business_date=excluded.business_date;
 set local role anon;set local request.headers='{"x-app-session":"22222222-2222-4222-8222-222222222222"}';
 select app_mutate('${op}','order','${payload}'::jsonb);
 select app_mutate('${op}','order','${payload}'::jsonb);
 select jsonb_build_object('count',(select count(*) from orders where id=${id}),'stock',app_inventory()->'test-a'->'veg'->'cart','date',(select stock_business_date from orders where id=${id}));rollback;`).split('\n').filter(l=>l.startsWith('{'));
 assert.equal(JSON.parse(result[0]).status,'ok');
 const last=JSON.parse(result.at(-1));assert.equal(last.count,1);assert.equal(last.stock,100);assert.equal(last.date,'2026-10-10');
});

 test('routine order events stay out of inbox and order trigger is disabled',()=>{
 assert.equal(sql("select count(*) from pg_trigger where tgrelid='orders'::regclass and tgname='partner_order_event'"),'0');
 const page=JSON.parse(request("select app_partner_inbox('inbox-test-a')"));
 const result=JSON.parse(request(`reset role;insert into partner_notifications(cart_id,audience,event_key,kind,title,body,target) select 'inbox-test-a','owner','suppressed:'||k,k,'Order activity','Fixture','orders' from unnest(array['order','cancel','payment']) k on conflict do nothing;set local role anon;select app_partner_inbox('inbox-test-a')`));
 assert.equal(result.unread,page.unread);assert.deepEqual(result.items,page.items);
 const claim=sql("select pg_get_functiondef('app_claim_partner_notifications()'::regprocedure)");
 assert.match(claim,/n.kind not in \('order','cancel','payment'\) and d.sent_at is null/);
 });

test('opening and submitted closing persist owner bell events independently of push',()=>{
 const result=sql(`begin;
 insert into opening_loads(cart_id,business_date,operation_id,quantities,actor_role,actor_name) values('inbox-test-a','2098-01-01','bbbbbbbb-1111-4111-8111-111111111111','{"veg":500}','staff','Inbox Staff');
 insert into closing_reports(id,cart_id,business_date,due_at,stock_types) overriding system value values(8999999,'inbox-test-a','2098-01-01',now(),'[]');
 select count(*) from partner_notifications where event_key='closing:8999999';
 update closing_reports set submitted_at=now(),submitted_name='Inbox Staff',cash_count=100,quantities='{}' where id=8999999;
 update closing_reports set notes='Reviewed' where id=8999999;
 set local role anon;set local request.headers='{"x-app-session":"${owner}"}';select app_partner_inbox('inbox-test-a');rollback;`).split('\n');
 assert.ok(result.includes('0'),'An unsubmitted closing must not notify owner');
 const inbox=JSON.parse(result.find(l=>l.startsWith('{')));
 assert.equal(inbox.items.filter(n=>n.kind==='opening'&&n.business_date==='2098-01-01').length,1);
 assert.equal(inbox.items.filter(n=>n.kind==='closing'&&n.business_date==='2098-01-01').length,1);
 assert.ok(inbox.items.filter(n=>['opening','closing'].includes(n.kind)).every(n=>!n.is_read));
});
