alter table public.notices drop constraint if exists notices_status_check;
alter table public.notices add constraint notices_status_check check (status in ('Nuevo', 'Pendiente de localizar', 'Sale', 'No sale'));
