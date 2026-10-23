begin;
insert into carts(id,name,active) values('refill-test','Refill',true);
insert into staff(id,cart_id,name,mobile,active) values(987654,'refill-test','Manager','9000098765',true);
insert into app_sessions(token,role,cart_id,name,staff_id,expires_at) values('99999999-1111-4111-8111-111111111111','staff','refill-test','Manager',987654,now()+interval '1 day');
insert into cart_opening_managers(cart_id,staff_id) values('refill-test',987654);
insert into app_private.inventory_days values('refill-test',app_private.stock_business_date('refill-test'));
update inventory set data=data||'{"refill-test":{"veg":{"freezer":100,"cart":7}}}'::jsonb where id=1;
update menus set data=data||'{"refill-test":{"stockTypes":[{"key":"veg","label":"Veg"}]}}'::jsonb where id=1;

insert into cart_closing_settings(cart_id,enabled) values('refill-test',true);
insert into closing_reports(id,cart_id,business_date,due_at,stock_types) overriding system value values(987654,'refill-test',app_private.stock_business_date('refill-test'),now()-interval '1 hour','[{"key":"veg","label":"Veg Momo"}]');
set local request.headers='{"x-app-session":"99999999-1111-4111-8111-111111111111"}';
do $$ begin
 if app_closing_stock_check('refill-test',987654) <> '{"veg":7}'::jsonb then raise exception 'Wrong expectation';end if;
 begin
 perform app_submit_closing_checked('refill-test',987654,gen_random_uuid(),0,'{"veg":0}','{"veg":7}','');
 raise exception 'Missing note accepted';
 exception when raise_exception then if sqlerrm not like 'Explain the stock difference%' then raise;end if;end;
 begin
 perform app_submit_closing_checked('refill-test',987654,gen_random_uuid(),0,'{"veg":0}','{"veg":8}','Counted twice');
 raise exception 'Stale expectation accepted';
 exception when raise_exception then if sqlerrm not like 'Stock changed%' then raise;end if;end;
end $$;
select app_submit_closing_checked('refill-test',987654,'aaaaaaaa-1111-4111-8111-111111111111',0,'{"veg":0}','{"veg":7}','Counted twice; owner review needed');
select app_submit_closing_checked('refill-test',987654,'aaaaaaaa-1111-4111-8111-111111111111',0,'{"veg":0}','{"veg":7}','Counted twice; owner review needed');
do $$ begin
 if (select expected_quantities from closing_reports where id=987654) <> '{"veg":7}'::jsonb then raise exception 'Snapshot missing';end if;
 if (select data->'refill-test'->'veg'->>'cart' from inventory where id=1)<>'7' then raise exception 'Count overwrote stock';end if;
end $$;
rollback;
