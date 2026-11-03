alter table public.notice_fields
  add column if not exists visible_on_card boolean not null default false;

update public.notice_fields
set visible_on_card = visible_in_table
where visible_on_card = false;
