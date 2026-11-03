drop policy if exists notices_insert_member on public.notices;
create policy notices_insert_operational on public.notices for insert to authenticated
with check (
  (private.is_super_admin() or private.has_company_role(company_id, array['gestor']))
  and (created_by is null or created_by = (select auth.uid()))
);
drop policy if exists notices_update_manager on public.notices;
create policy notices_update_operational on public.notices for update to authenticated
using (private.is_super_admin() or private.has_company_role(company_id, array['gestor']))
with check (private.is_super_admin() or private.has_company_role(company_id, array['gestor']));
