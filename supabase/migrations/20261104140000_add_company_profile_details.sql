alter table public.companies
  add column if not exists administrator_name text,
  add column if not exists tax_id text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;
