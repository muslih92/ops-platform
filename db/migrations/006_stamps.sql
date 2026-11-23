-- Stamp who/when closed a handover item
create or replace function app.handover_item_before() returns trigger
language plpgsql security invoker set search_path = public, app as $$
begin
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status = 'open') then
    new.closed_at := now(); new.closed_by := app.uid();
  elsif new.status = 'open' then
    new.closed_at := null; new.closed_by := null;
  end if;
  return new;
end $$;
create trigger trg_handover_item_before before insert or update on handover_items for each row execute function app.handover_item_before();

-- Stamp submission time of a performance review
create or replace function app.review_before() returns trigger
language plpgsql security invoker set search_path = public, app as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then new.submitted_at := now(); end if;
  if new.status = 'draft' then new.submitted_at := null; new.acknowledged_at := null; end if;
  return new;
end $$;
create trigger trg_reviews_before before insert or update on performance_reviews for each row execute function app.review_before();

-- The system administrator role always keeps every permission (prevents lock-out)
create or replace function app.protect_admin_perms() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from roles where id = old.role_id and key = 'system_admin') then
    raise exception 'لا يمكن سحب صلاحيات دور مدير النظام';
  end if;
  return old;
end $$;
create trigger trg_protect_admin_perms before delete on role_permissions for each row execute function app.protect_admin_perms();
