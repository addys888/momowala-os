-- Recover an offline sale on its recorded day without consuming today's fresh stock.
-- Original IDs, operation receipts, prices and authorization checks remain in force.
do $migration$
declare definition text; target text;
begin
 definition:=pg_get_functiondef('app_private.write_order(jsonb)'::regprocedure);
 target:=' perform app_private.inventory_delta(cid,ops);';
 if position(target in definition)=0 then raise exception 'order stock integration point missing'; end if;
 definition:=replace(definition,target,E' if old.id is null and newrow.source=''staff-entry'' and newrow.date<(now() at time zone ''Asia/Kolkata'')::date then\n  ops:=''{}''::jsonb; newrow.stock_business_date:=newrow.date;\n end if;\n'||target);
 execute definition;
end $migration$;
