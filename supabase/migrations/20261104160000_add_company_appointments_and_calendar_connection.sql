create table public.calendar_connections (
  company_id uuid primary key references public.companies(id) on delete cascade,
  client_id text not null,
  calendar_id text not null default 'primary',
  google_email text,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notice_id uuid references public.notices(id) on delete set null,
  start_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  customer_name text not null,
  phone text not null,
  address text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  google_event_id text,
  google_sync_error text,
  google_synced_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_company_start_idx on public.appointments(company_id, start_at);
create index appointments_notice_idx on public.appointments(notice_id);

alter table public.calendar_connections enable row level security;
alter table public.appointments enable row level security;
grant select, insert, update, delete on public.calendar_connections, public.appointments to authenticated;

create policy calendar_connections_read_member on public.calendar_connections
  for select to authenticated using (private.has_company(company_id));
create policy calendar_connections_manage_super_admin on public.calendar_connections
  for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());

create policy appointments_read_member on public.appointments
  for select to authenticated using (private.has_company(company_id));
create policy appointments_insert_operational on public.appointments
  for insert to authenticated with check (
    (private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text]))
    and created_by = (select auth.uid())
  );
create policy appointments_update_operational on public.appointments
  for update to authenticated
  using (private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text]))
  with check (private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text]));
create policy appointments_delete_operational on public.appointments
  for delete to authenticated using (
    private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text])
  );
