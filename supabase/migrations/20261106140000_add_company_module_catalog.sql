alter table public.companies add column if not exists enabled_modules jsonb not null default '{}'::jsonb;
