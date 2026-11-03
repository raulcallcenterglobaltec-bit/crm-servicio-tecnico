import { adminClient, authenticatedUser, companyRole, corsHeaders, encryptConfig, json, sendNoticeNotifications } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { company_id, kind, config, enabled = true } = await req.json()
    if (!company_id || !['telegram','email'].includes(kind)) return json({ error: 'Empresa o integración no válida.' }, 400)
    const admin = adminClient()
    const role = await companyRole(admin, company_id, user.id)
    if (!['owner','admin'].includes(role)) return json({ error: 'Solo un administrador puede cambiar integraciones.' }, 403)
    if (kind === 'telegram' && (!config?.bot_token || !config?.chat_id)) return json({ error: 'Falta el token o el ID del chat.' }, 400)
    if (kind === 'email' && (!config?.api_key || !config?.from || !Array.isArray(config?.to) || !config.to.length)) return json({ error: 'Falta la API key, remitente o destinatario.' }, 400)
    const encrypted_config = await encryptConfig(config)
    const { error } = await admin.from('company_integrations').upsert({ company_id, kind, enabled: !!enabled, encrypted_config, updated_at: new Date().toISOString() }, { onConflict: 'company_id,kind' })
    if (error) throw error
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la integración.' }, 400)
  }
})
