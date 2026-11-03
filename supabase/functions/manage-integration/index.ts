import { adminClient, authenticatedUser, companyRole, corsHeaders, decryptConfig, encryptConfig, json, sendNoticeNotifications } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { company_id, kind, config, enabled = true, action = 'save', routes } = await req.json()
    if (!company_id) return json({ error: 'Empresa no válida.' }, 400)
    const admin = adminClient()
    const role = await companyRole(admin, company_id, user.id)
    if (role !== 'super_admin') return json({ error: 'Solo el superadministrador puede cambiar integraciones.' }, 403)

    if (action === 'get_routes' || action === 'save_routes') {
      const { data: rows, error: rowsError } = await admin.from('company_integrations').select('kind,enabled,encrypted_config').eq('company_id', company_id)
      if (rowsError) throw rowsError
      const routeTypes = ['form','phone','complaint'] as const
      if (action === 'get_routes') {
        const channels = (rows || []).filter(x => x.enabled).map(x => x.kind)
        const saved: Record<string,string[]> = { form: [], phone: [], complaint: [] }
        const blocked: Record<string,string[]> = { form: [], phone: [], complaint: [] }
        for (const row of (rows || []).filter(x => x.enabled)) {
          const current = await decryptConfig(row.encrypted_config)
          const telegramComplaintMissing = row.kind === 'telegram' && !current.complaint_chat_id
          if (telegramComplaintMissing) blocked.complaint.push('telegram')
          for (const type of routeTypes) {
            const selected = current.routes
              ? Array.isArray(current.routes[type]) && current.routes[type].includes(row.kind)
              : true
            if (selected && !(type === 'complaint' && telegramComplaintMissing)) saved[type].push(row.kind)
          }
        }
        return json({ ok: true, channels, routes: saved, blocked })
      }
      if (!routes || routeTypes.some(type => !Array.isArray(routes[type]) || routes[type].some((value: string) => !['telegram','email','whatsapp'].includes(value)))) return json({ error: 'Selecciona destinos válidos para cada tipo de aviso.' }, 400)
      if (routes.complaint.includes('telegram')) {
        const telegramRow = (rows || []).find(x => x.kind === 'telegram' && x.enabled)
        const telegramConfig = telegramRow ? await decryptConfig(telegramRow.encrypted_config) : null
        if (!telegramConfig?.complaint_chat_id) return json({ error: 'Vuelve a configurar Telegram e indica el grupo distinto para reclamaciones o anulaciones.' }, 400)
      }
      for (const row of (rows || []).filter(x => x.enabled)) {
        const current = await decryptConfig(row.encrypted_config)
        current.routes = Object.fromEntries(routeTypes.map(type => [type, routes[type].includes(row.kind) ? [row.kind] : []]))
        const encrypted_config = await encryptConfig(current)
        const { error } = await admin.from('company_integrations').update({ encrypted_config, updated_at: new Date().toISOString() }).eq('company_id', company_id).eq('kind', row.kind)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (!['telegram','email','whatsapp'].includes(kind)) return json({ error: 'Integración no válida.' }, 400)
    if (kind === 'telegram' && (!config?.bot_token || !config?.chat_id || !config?.complaint_chat_id)) return json({ error: 'Indica el token, el chat de avisos y el chat distinto para reclamaciones o anulaciones.' }, 400)
    if (kind === 'email' && (!config?.api_key || !config?.from || !Array.isArray(config?.to) || !config.to.length)) return json({ error: 'Falta la API key, remitente o destinatario.' }, 400)
    if (kind === 'whatsapp' && (!config?.access_token || !/^\d{5,30}$/.test(String(config?.phone_number_id || '')) || !/^\d{8,15}$/.test(String(config?.to || '')) || !/^[a-z0-9_]{2,512}$/i.test(String(config?.template_name || '')) || !/^[a-zA-Z_]{2,16}$/.test(String(config?.language || '')))) return json({ error: 'Revisa el token, ID del número, número de destino, plantilla e idioma de WhatsApp.' }, 400)
    const { data: existing, error: existingError } = await admin.from('company_integrations').select('encrypted_config').eq('company_id', company_id).eq('kind', kind).maybeSingle()
    if (existingError) throw existingError
    const previous = existing?.encrypted_config ? await decryptConfig(existing.encrypted_config) : null
    const savedRoutes = previous?.routes || (previous ? { form: [kind], phone: [kind], complaint: [kind] } : { form: [], phone: [], complaint: [] })
    const encrypted_config = await encryptConfig({ ...config, routes: savedRoutes })
    const { error } = await admin.from('company_integrations').upsert({ company_id, kind, enabled: !!enabled, encrypted_config, updated_at: new Date().toISOString() }, { onConflict: 'company_id,kind' })
    if (error) throw error
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la integración.' }, 400)
  }
})
