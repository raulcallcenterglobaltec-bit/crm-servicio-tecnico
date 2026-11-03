drop policy if exists company_logo_admin_insert on storage.objects;
create policy company_logo_super_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'company-logos' and private.is_super_admin());
drop policy if exists company_logo_super_admin_update on storage.objects;
create policy company_logo_super_admin_update on storage.objects for update to authenticated
using (bucket_id = 'company-logos' and private.is_super_admin())
with check (bucket_id = 'company-logos' and private.is_super_admin());
drop policy if exists company_logo_super_admin_delete on storage.objects;
create policy company_logo_super_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'company-logos' and private.is_super_admin());
