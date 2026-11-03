alter table public.notices
  drop constraint if exists notices_notice_type_check;

alter table public.notices
  add constraint notices_notice_type_check
  check (notice_type in ('aviso','reclamacion','anulacion'));

alter table public.notices
  drop constraint if exists notices_complaint_source_check;

alter table public.notices
  add constraint notices_complaint_source_check
  check (notice_type = 'aviso' or (landing_id is null and created_by is not null));
