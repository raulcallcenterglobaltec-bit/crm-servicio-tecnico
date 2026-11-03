import { adminClient, authenticatedUser, companyRole, corsHeaders, json } from '../_shared/common.ts'

const appUrl = 'https://raulcallcenterglobaltec-bit.github.io/crm-servicio-tecnico/'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { company_id, email: rawEmail, role } = await req.json()
    const email = String(rawEmail || '').trim().toLowerCase()
    if (!company_id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin','gestor','consulta'].includes(role)) return json({ error: 'Correo o rol no válido.' }, 400)
    const admin = adminClient()
    if (!['owner','admin'].includes(await companyRole(admin, company_id, user.id))) return json({ error: 'Solo un administrador puede invitar usuarios.' }, 403)
    const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) throw listError
    let target = users.users.find(x => x.email?.toLowerCase() === email)
    if (!target) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: appUrl })
      if (error) throw error
      target = data.user
    }
    if (!target) throw new Error('No se pudo preparar la invitación.')
    const { error } = await admin.from('company_members').upsert({ company_id, user_id: target.id, email, role }, { onConflict: 'company_id,user_id' })
    if (error) throw error
    return json({ ok: true, email })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar la invitación.' }, 400)
  }
})
