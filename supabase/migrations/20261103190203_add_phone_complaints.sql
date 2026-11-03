alter table public.notices
  add column if not exists notice_type text not null default 'aviso'
  check (notice_type in ('aviso','reclamacion'));

alter table public.notices
  drop constraint if exists notices_complaint_source_check;

alter table public.notices
  add constraint notices_complaint_source_check
  check (notice_type <> 'reclamacion' or (landing_id is null and created_by is not null));

create index if not exists notices_company_type_received_idx
  on public.notices(company_id, notice_type, received_at desc);
