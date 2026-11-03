import { adminClient, authenticatedUser, companyRole, corsHeaders, json, sendNoticeNotifications } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { company_id, kind } = await req.json()
    if (!company_id || !['telegram','email'].includes(kind)) return json({ error: 'Empresa o integración no válida.' }, 400)
    const admin = adminClient()
    const role = await companyRole(admin, company_id, user.id)
    if (!['owner','admin'].includes(role)) return json({ error: 'Solo un administrador puede probar integraciones.' }, 403)
    const results = await sendNoticeNotifications(admin, company_id, {}, 'CRM Servicio Técnico', true, kind)
    const result = results.find(x => x.kind === kind)
    if (!result) return json({ error: 'Configura esta integración antes de enviar la prueba.' }, 400)
    if (!result.ok) return json({ error: result.error || 'El proveedor rechazó la prueba.' }, 502)
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar la prueba.' }, 400)
  }
})
