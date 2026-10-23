import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const token='99999999-1111-4111-8111-111111111111';
const setup=`
insert into carts(id,name,active) values('refill-test','Refill',true);
insert into staff(id,cart_id,name,mobile,active) values(987654,'refill-test','Manager','9000098765',true);
insert into app_sessions(token,role,cart_id,name,staff_id,expires_at) values('${token}','staff','refill-test','Manager',987654,now()+interval '1 day');
insert into cart_opening_managers(cart_id,staff_id) values('refill-test',987654);
insert into app_private.inventory_days values('refill-test',app_private.stock_business_date('refill-test'));
update inventory set data=data||'{"refill-test":{"veg":{"freezer":100,"cart":7}}}'::jsonb where id=1;
update menus set data=data||'{"refill-test":{"stockTypes":[{"key":"veg","label":"Veg"}]}}'::jsonb where id=1;
`;
const opening=`insert into opening_loads(cart_id,business_date,operation_id,quantities,actor_role,actor_name) values('refill-test',app_private.stock_business_date('refill-test'),gen_random_uuid(),'{"veg":20}','staff','Manager');`;
const call=(qty=20,cat='veg',id='aaaaaaaa-1111-4111-8111-111111111111')=>`select app_refill_stock('refill-test',app_private.stock_business_date('refill-test'),'${id}','${cat}',${qty});`;
function run(body,{loaded=true,extra=''}={}) {
 return execFileSync('psql',['-h','127.0.0.1','-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',`begin;${setup}${loaded?opening:''}${extra}set local request.headers='{"x-app-session":"${token}"}';${body}rollback;`],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
}
test('refill adds remaining stock, deducts freezer and logs once across retry',()=>{
 const out=run(`${call()}${call()}select 'stock='||(data->'refill-test'->'veg')::text from inventory where id=1; select 'logs='||count(*) from cart_loadings where cart_id='refill-test';`);
 assert.match(out,/"cart": 27/);assert.match(out,/"freezer": 80/);assert.match(out,/logs=1/);
});
test('opening stock is required',()=>assert.throws(()=>run(call(),{loaded:false}),/opening stock before refilling/));
test('only assigned active manager may refill',()=>{
 assert.throws(()=>run(call(),{extra:"update cart_opening_managers set staff_id=null where cart_id='refill-test';"}),/assigned active manager/);
 assert.throws(()=>run(call(),{extra:"update staff set active=false where id=987654;"}));
});
test('invalid quantities, categories and insufficient freezer stock are rejected',()=>{
 for(const [qty,cat,error] of [[0,'veg',/positive/],[-1,'veg',/positive/],[101,'veg',/Not enough/],[1,'other',/Unknown/]]) assert.throws(()=>run(call(qty,cat)),error);
});
test('operation references cannot be reused for a changed quantity',()=>assert.throws(()=>run(call()+call(21)),/already used/));
test('multiple intentional refills accumulate',()=>assert.match(run(call()+call(10,'veg','bbbbbbbb-1111-4111-8111-111111111111')+"select data->'refill-test'->'veg' from inventory where id=1;"),/"cart": 37/));
test('stale business day is rejected',()=>assert.throws(()=>run(call().replace("app_private.stock_business_date('refill-test')","current_date-2")),/new business day/));
test('anonymous-role manager RPC works while private receipt table stays inaccessible',()=>{
 assert.match(run('set local role anon;'+call().replace("app_private.stock_business_date('refill-test')","(app_opening_status('refill-test',null)->>'businessDate')::date")),/"status": "ok"/);
 assert.throws(()=>run('set local role anon; select * from app_private.stock_refills;'),/permission denied/);
});
