drop policy if exists companies_delete_super_admin on public.companies;

create policy companies_delete_super_admin on public.companies
for delete to authenticated
using (private.is_super_admin());
