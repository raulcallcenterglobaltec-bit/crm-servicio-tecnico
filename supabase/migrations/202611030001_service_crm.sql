create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  logo_path text,
  primary_color text not null default '#5267e8' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','gestor','consulta')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function private.has_company(company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members m where m.company_id = company and m.user_id = (select auth.uid()));
$$;

create or replace function private.has_company_role(company uuid, allowed text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members m where m.company_id = company and m.user_id = (select auth.uid()) and m.role = any(allowed));
$$;
create or replace function private.is_company_owner(company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members m where m.company_id = company and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on function private.has_company(uuid) from public, anon;
revoke all on function private.has_company_role(uuid,text[]) from public, anon;
revoke all on function private.is_company_owner(uuid) from public, anon;
grant execute on function private.has_company(uuid) to authenticated;
grant execute on function private.has_company_role(uuid,text[]) to authenticated;
grant execute on function private.is_company_owner(uuid) to authenticated;

create or replace function public.create_company_for_self(company_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(trim(company_name)) < 2 or length(trim(company_name)) > 120 then raise exception 'Company name must be 2 to 120 characters'; end if;
  insert into public.companies(name, created_by) values (trim(company_name), current_user_id) returning id into new_id;
  insert into public.company_members(company_id, user_id, email, role)
  values (new_id, current_user_id, coalesce(auth.jwt() ->> 'email',''), 'owner');
  return new_id;
end;
$$;
revoke all on function public.create_company_for_self(text) from public, anon;
grant execute on function public.create_company_for_self(text) to authenticated;

create table public.landings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  url text,
  endpoint_key text not null unique default encode(gen_random_bytes(24), 'hex'),
  allowed_origins text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.notice_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landing_id uuid references public.landings(id) on delete cascade,
  field_key text not null,
  label text not null check (length(trim(label)) between 1 and 100),
  field_type text not null default 'text' check (field_type in ('text','phone','email','number','date','select','textarea','checkbox')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  visible_in_form boolean not null default true,
  visible_in_table boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index notice_fields_company_global_key_idx on public.notice_fields(company_id, field_key) where landing_id is null;
create unique index notice_fields_landing_key_idx on public.notice_fields(landing_id, field_key) where landing_id is not null;

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landing_id uuid not null references public.landings(id) on delete cascade,
  category text not null check (category in ('Gama blanca','Clima')),
  price numeric(10,2) not null default 0 check (price >= 0),
  updated_at timestamptz not null default now(),
  unique (landing_id, category)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  landing_id uuid references public.landings(id) on delete set null,
  received_at timestamptz not null default now(),
  status text not null default 'Nuevo' check (status in ('Nuevo','Sale','No sale')),
  customer_name text not null default '',
  phone text not null default '',
  email text,
  locality text,
  postal_code text,
  device text,
  category text check (category is null or category in ('Gama blanca','Clima')),
  brand text,
  issue text,
  custom_fields jsonb not null default '{}'::jsonb,
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  managed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null
);
create index notices_company_received_idx on public.notices(company_id, received_at desc);
create index notices_company_status_idx on public.notices(company_id, status, received_at desc);

create table public.company_integrations (
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('telegram','email')),
  enabled boolean not null default false,
  encrypted_config text not null default '',
  updated_at timestamptz not null default now(),
  primary key (company_id, kind)
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.landings enable row level security;
alter table public.notice_fields enable row level security;
alter table public.tariffs enable row level security;
alter table public.notices enable row level security;
alter table public.company_integrations enable row level security;

create policy companies_read_member on public.companies for select to authenticated using (private.has_company(id));
create policy companies_update_admin on public.companies for update to authenticated using (private.has_company_role(id, array['owner','admin'])) with check (private.has_company_role(id, array['owner','admin']));

create policy members_read_self_or_admin on public.company_members for select to authenticated using (user_id = (select auth.uid()) or private.has_company_role(company_id, array['owner','admin']));
create policy members_insert_admin on public.company_members for insert to authenticated with check (private.has_company_role(company_id, array['owner','admin']) and (role <> 'owner' or private.is_company_owner(company_id)));
create policy members_update_admin on public.company_members for update to authenticated using (private.has_company_role(company_id, array['owner','admin']) and (role <> 'owner' or private.is_company_owner(company_id))) with check (private.has_company_role(company_id, array['owner','admin']) and (role <> 'owner' or private.is_company_owner(company_id)));
create policy members_delete_admin on public.company_members for delete to authenticated using (private.has_company_role(company_id, array['owner','admin']) and role <> 'owner');

create policy landings_read_member on public.landings for select to authenticated using (private.has_company(company_id));
create policy landings_insert_admin on public.landings for insert to authenticated with check (private.has_company_role(company_id, array['owner','admin']));
create policy landings_update_admin on public.landings for update to authenticated using (private.has_company_role(company_id, array['owner','admin'])) with check (private.has_company_role(company_id, array['owner','admin']));
create policy landings_delete_admin on public.landings for delete to authenticated using (private.has_company_role(company_id, array['owner','admin']));

create policy fields_read_member on public.notice_fields for select to authenticated using (private.has_company(company_id));
create policy fields_insert_admin on public.notice_fields for insert to authenticated with check (private.has_company_role(company_id, array['owner','admin']));
create policy fields_update_admin on public.notice_fields for update to authenticated using (private.has_company_role(company_id, array['owner','admin'])) with check (private.has_company_role(company_id, array['owner','admin']));
create policy fields_delete_admin on public.notice_fields for delete to authenticated using (private.has_company_role(company_id, array['owner','admin']));

create policy tariffs_read_member on public.tariffs for select to authenticated using (private.has_company(company_id));
create policy tariffs_insert_admin on public.tariffs for insert to authenticated with check (private.has_company_role(company_id, array['owner','admin']));
create policy tariffs_update_admin on public.tariffs for update to authenticated using (private.has_company_role(company_id, array['owner','admin'])) with check (private.has_company_role(company_id, array['owner','admin']));
create policy tariffs_delete_admin on public.tariffs for delete to authenticated using (private.has_company_role(company_id, array['owner','admin']));

create policy notices_read_member on public.notices for select to authenticated using (private.has_company(company_id));
create policy notices_insert_member on public.notices for insert to authenticated with check (private.has_company_role(company_id, array['owner','admin','gestor']) and (created_by is null or created_by = (select auth.uid())));
create policy notices_update_manager on public.notices for update to authenticated using (private.has_company_role(company_id, array['owner','admin','gestor'])) with check (private.has_company_role(company_id, array['owner','admin','gestor']));
create policy notices_delete_admin on public.notices for delete to authenticated using (private.has_company_role(company_id, array['owner','admin']));

-- Integration secrets are accessible only to trusted Edge Functions using the server key.
grant select, insert, update, delete on public.company_integrations to service_role;
grant select, insert, update, delete on public.companies, public.company_members, public.landings, public.notice_fields, public.tariffs, public.notices to authenticated;
grant usage on schema public to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos','company-logos',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;
create policy company_logo_public_read on storage.objects for select to public using (bucket_id = 'company-logos');
create policy company_logo_admin_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'company-logos' and (storage.foldername(name))[1] is not null
  and private.has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
);
create policy company_logo_admin_update on storage.objects for update to authenticated using (
  bucket_id = 'company-logos' and private.has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
) with check (
  bucket_id = 'company-logos' and private.has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
);
create policy company_logo_admin_delete on storage.objects for delete to authenticated using (
  bucket_id = 'company-logos' and private.has_company_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notices') then
    alter publication supabase_realtime add table public.notices;
  end if;
end $$;
