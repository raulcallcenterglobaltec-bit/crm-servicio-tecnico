import { adminClient, authenticatedUser, companyRole, corsHeaders, decryptConfig, encryptConfig, integrationDestination, json, sendNoticeNotifications } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { company_id, kind, config, enabled = true, action = 'save', routes, destinations } = await req.json()
    if (!company_id) return json({ error: 'Empresa no válida.' }, 400)
    const admin = adminClient()
    const role = await companyRole(admin, company_id, user.id)
    if (role !== 'super_admin') return json({ error: 'Solo el superadministrador puede cambiar integraciones.' }, 403)

    if (action === 'get_routes' || action === 'save_routes') {
      const { data: rows, error: rowsError } = await admin.from('company_integrations').select('kind,enabled,encrypted_config').eq('company_id', company_id)
      if (rowsError) throw rowsError
      const routeTypes = ['form','phone','complaint'] as const
      const channelTypes = ['telegram','whatsapp','email'] as const
      if (action === 'get_routes') {
        const enabledRows = (rows || []).filter(x => x.enabled)
        const channels = enabledRows.map(x => x.kind)
        const saved: Record<string,string[]> = { form: [], phone: [], complaint: [] }
        const blocked: Record<string,string[]> = { form: [], phone: [], complaint: [] }
        const targets: Record<string,Record<string,unknown>> = Object.fromEntries(routeTypes.map(type => [type, {}]))
        for (const row of enabledRows) {
          const current = await decryptConfig(row.encrypted_config)
          for (const type of routeTypes) {
            let target = integrationDestination(current, row.kind, type)
            if (row.kind === 'email') target = Array.isArray(target) ? target.join(', ') : (target || '')
            targets[type][row.kind] = target || ''
            const legacyDefault = row.kind === 'telegram' ? !!(type === 'complaint' ? current.complaint_chat_id : current.chat_id) : !!current.to
            const selected = current.routes
              ? Array.isArray(current.routes[type]) && current.routes[type].includes(row.kind)
              : legacyDefault
            const hasTarget = Array.isArray(target) ? target.length > 0 : !!target
            if (selected && hasTarget) saved[type].push(row.kind)
            else if (selected && !hasTarget) blocked[type].push(row.kind)
          }
        }
        return json({ ok: true, channels, routes: saved, blocked, destinations: targets })
      }
      if (!routes || routeTypes.some(type => !Array.isArray(routes[type]) || routes[type].some((value: string) => !channelTypes.includes(value as any)))) return json({ error: 'Selecciona destinos válidos para cada tipo de aviso.' }, 400)
      const enabledRows = (rows || []).filter(x => x.enabled)
      const updates = new Map<string,Record<string,any>>()
      for (const row of enabledRows) updates.set(row.kind, await decryptConfig(row.encrypted_config))
      const normalized: Record<string,Record<string,unknown>> = {}
      for (const type of routeTypes) {
        normalized[type] = {}
        for (const channel of channelTypes) {
          const raw = destinations?.[type]?.[channel]
          let target: string | string[] = typeof raw === 'string' ? raw.trim() : ''
          if (channel === 'email') {
            target = (typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : []).map((value: unknown) => String(value).trim()).filter(Boolean)
            if ((routes[type] as string[]).includes(channel) && (!target.length || target.some((email: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) return json({ error: `Indica un correo válido para ${type === 'form' ? 'avisos de formulario' : type === 'phone' ? 'avisos telefónicos' : 'reclamaciones o anulaciones'}.` }, 400)
          } else if (channel === 'whatsapp') {
            target = String(target).replace(/\D/g, '')
            if ((routes[type] as string[]).includes(channel) && !/^\d{8,15}$/.test(target as string)) return json({ error: `Indica el número de WhatsApp con prefijo internacional para ${type === 'form' ? 'avisos de formulario' : type === 'phone' ? 'avisos telefónicos' : 'reclamaciones o anulaciones'}.` }, 400)
          } else if ((routes[type] as string[]).includes(channel) && !target) {
            return json({ error: `Indica el grupo de Telegram para ${type === 'form' ? 'avisos de formulario' : type === 'phone' ? 'avisos telefónicos' : 'reclamaciones o anulaciones'}.` }, 400)
          }
          normalized[type][channel] = target
          if ((routes[type] as string[]).includes(channel) && !updates.has(channel)) return json({ error: `Configura ${channel} antes de activarlo.` }, 400)
        }
      }
      for (const row of enabledRows) {
        const current = updates.get(row.kind)!
        current.routes = Object.fromEntries(routeTypes.map(type => [type, routes[type].includes(row.kind) ? [row.kind] : []]))
        for (const type of routeTypes) {
          const value = normalized[type][row.kind]
          if (row.kind === 'telegram') current[`${type}_chat_id`] = value
          else current[`${type}_to`] = value
        }
      }
      for (const row of enabledRows) {
        const encrypted_config = await encryptConfig(updates.get(row.kind)!)
        const { error } = await admin.from('company_integrations').update({ encrypted_config, updated_at: new Date().toISOString() }).eq('company_id', company_id).eq('kind', row.kind)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (!['telegram','email','whatsapp'].includes(kind)) return json({ error: 'Integración no válida.' }, 400)
    if (kind === 'telegram' && !config?.bot_token) return json({ error: 'Indica el token del bot de Telegram.' }, 400)
    if (kind === 'email' && (!config?.api_key || !config?.from)) return json({ error: 'Falta la API key o el remitente.' }, 400)
    if (kind === 'whatsapp' && (!config?.access_token || !/^\d{5,30}$/.test(String(config?.phone_number_id || '')) || !/^[a-z0-9_]{2,512}$/i.test(String(config?.template_name || '')) || !/^[a-zA-Z_]{2,16}$/.test(String(config?.language || '')))) return json({ error: 'Revisa el token, ID del número, plantilla e idioma de WhatsApp.' }, 400)
    const { data: existing, error: existingError } = await admin.from('company_integrations').select('encrypted_config').eq('company_id', company_id).eq('kind', kind).maybeSingle()
    if (existingError) throw existingError
    const previous = existing?.encrypted_config ? await decryptConfig(existing.encrypted_config) : null
    const savedRoutes = previous?.routes || (previous ? { form: [kind], phone: [kind], complaint: [kind] } : { form: [], phone: [], complaint: [] })
    const encrypted_config = await encryptConfig({ ...(previous || {}), ...config, routes: savedRoutes })
    const { error } = await admin.from('company_integrations').upsert({ company_id, kind, enabled: !!enabled, encrypted_config, updated_at: new Date().toISOString() }, { onConflict: 'company_id,kind' })
    if (error) throw error
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo guardar la integración.' }, 400)
  }
})
