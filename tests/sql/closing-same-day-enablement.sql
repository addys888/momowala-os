begin;
insert into carts(id,name,active) values('late-close-test','Late test',true);
insert into cart_closing_settings(cart_id,enabled,closing_time,updated_at) values('late-close-test',true,'22:00','2026-10-21 23:04:00+05:30');
select app_private.collect_closing_reports('2026-10-21 23:10:00+05:30','late-close-test');
select app_private.collect_closing_reports('2026-10-21 23:11:00+05:30','late-close-test');
do $$ begin
 if (select count(*) from closing_reports where cart_id='late-close-test')<>1 then raise exception 'Expected one same-day task';end if;
 if not exists(select 1 from closing_reports where cart_id='late-close-test' and business_date='2026-10-21' and submitted_at is null) then raise exception 'Wrong date';end if;
end $$;
delete from closing_reports where cart_id='late-close-test';
select app_private.collect_closing_reports('2026-10-21 21:59:00+05:30','late-close-test');
do $$ begin if exists(select 1 from closing_reports where cart_id='late-close-test') then raise exception 'Premature or historical task';end if;end $$;
rollback;
