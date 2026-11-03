alter table public.tariffs
  alter column landing_id drop not null,
  add column scope text not null default 'landing',
  add column locality text;

alter table public.tariffs
  add constraint tariffs_scope_check
    check (scope in ('landing', 'phone')),
  add constraint tariffs_scope_target_check
    check (
      (scope = 'landing' and landing_id is not null and locality is null)
      or
      (scope = 'phone' and landing_id is null and nullif(btrim(locality), '') is not null)
    );

create unique index tariffs_phone_city_category_uidx
  on public.tariffs (
    company_id,
    translate(lower(regexp_replace(btrim(locality), '\s+', ' ', 'g')), 'áéíóúüñ', 'aeiouun'),
    category
  )
  where scope = 'phone';

create index tariffs_phone_lookup_idx
  on public.tariffs (company_id, category)
  where scope = 'phone';
