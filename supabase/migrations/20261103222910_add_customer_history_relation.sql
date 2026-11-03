alter table public.notices
  add constraint notices_company_id_id_key unique (company_id, id);

alter table public.notices
  add column related_notice_id uuid;

alter table public.notices
  add constraint notices_related_notice_same_company_fkey
  foreign key (company_id, related_notice_id)
  references public.notices (company_id, id)
  on delete set null (related_notice_id);

alter table public.notices
  add constraint notices_related_notice_type_check
  check (related_notice_id is null or notice_type in ('reclamacion', 'anulacion'));

create index notices_company_related_notice_received_idx
  on public.notices (company_id, related_notice_id, received_at desc)
  where related_notice_id is not null;
