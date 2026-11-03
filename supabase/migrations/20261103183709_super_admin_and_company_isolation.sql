create table if not exists public.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.global_admins enable row level security;
revoke all on public.global_admins from public, anon, authenticated;
grant select, insert, update, delete on public.global_admins to service_role;

insert into public.global_admins(user_id)
values ('875e8891-e1c2-4eea-8714-b19fdf1a1b13'::uuid)
on conflict (user_id) do nothing;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.global_admins g where g.user_id = (select auth.uid()));
$$;
revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin();
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function private.has_company(company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.company_members m
    where m.company_id = company and m.user_id = (select auth.uid())
  );
$$;
create or replace function private.has_company_role(company uuid, allowed text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.company_members m
    where m.company_id = company and m.user_id = (select auth.uid()) and m.role = any(allowed)
  );
$$;
revoke all on function private.has_company(uuid) from public, anon;
revoke all on function private.has_company_role(uuid,text[]) from public, anon;
grant execute on function private.has_company(uuid) to authenticated;
grant execute on function private.has_company_role(uuid,text[]) to authenticated;

create or replace function public.create_company_for_self(company_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not private.is_super_admin() then
    raise exception 'Solo el superadministrador puede crear empresas';
  end if;
  if length(trim(company_name)) < 2 or length(trim(company_name)) > 120 then
    raise exception 'Company name must be between 2 and 120 characters';
  end if;
  insert into public.companies(name, created_by) values (trim(company_name), current_user_id) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_company_for_self(text) from public, anon;
grant execute on function public.create_company_for_self(text) to authenticated;

create unique index if not exists company_members_one_company_per_user_idx
on public.company_members(user_id);

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_super_admin on public.companies for update to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());

drop policy if exists members_read_self_or_admin on public.company_members;
create policy members_read_self_or_super_admin on public.company_members for select to authenticated
using (user_id = (select auth.uid()) or private.is_super_admin());
drop policy if exists members_insert_admin on public.company_members;
create policy members_insert_super_admin on public.company_members for insert to authenticated
with check (private.is_super_admin() and role in ('gestor','consulta'));
drop policy if exists members_update_admin on public.company_members;
create policy members_update_super_admin on public.company_members for update to authenticated
using (private.is_super_admin()) with check (private.is_super_admin() and role in ('gestor','consulta'));
drop policy if exists members_delete_admin on public.company_members;
create policy members_delete_super_admin on public.company_members for delete to authenticated
using (private.is_super_admin());

drop policy if exists landings_insert_admin on public.landings;
create policy landings_insert_super_admin on public.landings for insert to authenticated
with check (private.is_super_admin());
drop policy if exists landings_update_admin on public.landings;
create policy landings_update_super_admin on public.landings for update to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());
drop policy if exists landings_delete_admin on public.landings;
create policy landings_delete_super_admin on public.landings for delete to authenticated
using (private.is_super_admin());

drop policy if exists fields_insert_admin on public.notice_fields;
create policy fields_insert_super_admin on public.notice_fields for insert to authenticated
with check (private.is_super_admin());
drop policy if exists fields_update_admin on public.notice_fields;
create policy fields_update_super_admin on public.notice_fields for update to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());
drop policy if exists fields_delete_admin on public.notice_fields;
create policy fields_delete_super_admin on public.notice_fields for delete to authenticated
using (private.is_super_admin());

drop policy if exists tariffs_insert_admin on public.tariffs;
create policy tariffs_insert_super_admin on public.tariffs for insert to authenticated
with check (private.is_super_admin());
drop policy if exists tariffs_update_admin on public.tariffs;
create policy tariffs_update_super_admin on public.tariffs for update to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());
drop policy if exists tariffs_delete_admin on public.tariffs;
create policy tariffs_delete_super_admin on public.tariffs for delete to authenticated
using (private.is_super_admin());

drop policy if exists notices_delete_admin on public.notices;
create policy notices_delete_super_admin on public.notices for delete to authenticated
using (private.is_super_admin());
