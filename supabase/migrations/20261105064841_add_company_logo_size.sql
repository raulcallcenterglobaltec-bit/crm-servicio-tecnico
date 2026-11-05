alter table public.companies
  add column if not exists logo_size integer not null default 36
  constraint companies_logo_size_range check (logo_size between 36 and 96);
