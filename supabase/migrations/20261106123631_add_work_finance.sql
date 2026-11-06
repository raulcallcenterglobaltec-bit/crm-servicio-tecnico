alter table public.companies
  add column if not exists show_tariff_reports boolean not null default true,
  add column if not exists show_work_finance boolean not null default false;

alter table public.notices
  add column if not exists work_amount numeric(12,2) check (work_amount is null or work_amount >= 0),
  add column if not exists work_completed_at date,
  add column if not exists invoice_issued boolean not null default false,
  add column if not exists invoice_date date,
  add column if not exists invoice_number text,
  add column if not exists material_cost numeric(12,2) not null default 0 check (material_cost >= 0),
  add column if not exists other_cost numeric(12,2) not null default 0 check (other_cost >= 0),
  add column if not exists other_cost_note text;

update public.notices
set work_completed_at = coalesce(managed_at::date, received_at::date)
where status = 'Sale' and work_completed_at is null;

create table if not exists public.notice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notice_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint notice_payments_same_company_notice_fkey
    foreign key (company_id, notice_id)
    references public.notices(company_id, id) on delete cascade
);

create index if not exists notice_payments_company_paid_at_idx
  on public.notice_payments (company_id, paid_at desc);
create index if not exists notice_payments_company_notice_idx
  on public.notice_payments (company_id, notice_id);

alter table public.notice_payments enable row level security;
grant select, insert, delete on public.notice_payments to authenticated;

drop policy if exists notice_payments_read_member on public.notice_payments;
create policy notice_payments_read_member
  on public.notice_payments for select to authenticated
  using (private.has_company(company_id));

drop policy if exists notice_payments_insert_operational on public.notice_payments;
create policy notice_payments_insert_operational
  on public.notice_payments for insert to authenticated
  with check (
    (private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text]))
    and created_by = (select auth.uid())
  );

drop policy if exists notice_payments_delete_operational on public.notice_payments;
create policy notice_payments_delete_operational
  on public.notice_payments for delete to authenticated
  using (private.is_super_admin() or private.has_company_role(company_id, array['gestor'::text]));

comment on table public.notice_payments is
  'Pagos parciales o completos recibidos por trabajos asociados a avisos; restringido por empresa mediante RLS.';
comment on column public.notices.work_amount is
  'Importe final del trabajo para empresas que registran facturación por trabajo.';
comment on column public.notices.material_cost is
  'Gastos de materiales asociados al trabajo.';
comment on column public.notices.other_cost is
  'Otros gastos asociados al trabajo.';
