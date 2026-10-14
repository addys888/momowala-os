-- One user action, one transaction and receipt. Existing APK commands remain supported.
create or replace function public.app_mutate_batch(p_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path=public,app_private as $$
declare s app_sessions:=app_private.session(); who text; prior app_private.operations;
 cmd jsonb; r jsonb; results jsonb:='[]'; n int:=0; child uuid; cid text; k text; v jsonb; inv jsonb;
begin
 if s.role is null then raise exception 'Sign in required' using errcode='42501'; end if;
 who:=concat_ws(':',s.role,s.cart_id,s.name);
 if jsonb_typeof(p_commands) is distinct from 'array' or jsonb_array_length(p_commands) not between 1 and 100 then raise exception 'Invalid change batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into prior from app_private.operations where id=p_id;
 if found then
  if prior.actor<>who then raise exception 'Not authorised' using errcode='42501'; end if;
  return prior.result;
 end if;
 for cmd in select value from jsonb_array_elements(p_commands) loop
  n:=n+1; child:=md5(p_id::text||':'||n::text)::uuid;
  if cmd->>'kind'='row' and cmd->'payload'->>'table'='day_close_logs' then
   cid:=cmd->'payload'->'after'->>'cart_id';
   if not app_private.allowed(cid,array['admin','owner']) then raise exception 'Not authorised' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended(cid||':'||(cmd->'payload'->'after'->>'date'),2));
   if exists(select 1 from day_close_logs where cart_id=cid and date=(cmd->'payload'->'after'->>'date')::date and id<>(cmd->'payload'->'after'->>'id')::bigint) then
    raise exception 'This day was already reconciled on another phone. Reload saved data before continuing.';
   end if;
  end if;
  if cmd->>'kind'='inventory' then
   cid:=cmd->'payload'->>'cartId';
   if not app_private.allowed(cid) then raise exception 'Not authorised' using errcode='42501'; end if;
   select data->cid into inv from inventory where id=1 for update;
   for k,v in select * from jsonb_each(cmd->'payload'->'ops') loop
    if v ? 'cset' and (inv->k->'cart') is distinct from (cmd->'payload'->'expected'->k->'cart') then raise exception 'Cart stock changed on another phone. Refresh and recount.'; end if;
    if v ? 'fset' and (inv->k->'freezer') is distinct from (cmd->'payload'->'expected'->k->'freezer') then raise exception 'Freezer stock changed on another phone. Refresh and recount.'; end if;
    if coalesce((v->>'fset')::numeric,coalesce((inv->k->>'freezer')::numeric,0)+coalesce((v->>'df')::numeric,0))<0 or
       coalesce((v->>'cset')::numeric,coalesce((inv->k->>'cart')::numeric,0)+coalesce((v->>'dc')::numeric,0))<0 then
      raise exception 'Not enough stock. Refresh before moving or discarding stock.';
    end if;
   end loop;
  end if;
  r:=app_mutate(child,cmd->>'kind',cmd->'payload');
  if r->>'status' is distinct from 'ok' then raise exception '%',coalesce(r->>'message','Change could not be saved'); end if;
  results:=results||jsonb_build_array(r);
 end loop;
 r:=jsonb_build_object('status','ok','results',results);
 insert into app_private.operations(id,actor,result) values(p_id,who,r);
 return r;
end $$;
revoke all on function public.app_mutate_batch(uuid,jsonb) from public,authenticated;
grant execute on function public.app_mutate_batch(uuid,jsonb) to anon;
notify pgrst,'reload schema';
