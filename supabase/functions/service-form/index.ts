import { adminClient, corsHeaders, json, sendNoticeNotifications } from '../_shared/common.ts'

function categoryFor(device: string) {
  return /aire acondicionado|aerotermia|bomba de calor|acs|caldera|calentador|termo/i.test(device) ? 'Clima' : (device ? 'Gama blanca' : null)
}
function text(value: unknown, max = 500) { return String(value ?? '').trim().slice(0, max) }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Envía el formulario mediante POST.' }, 405)
  try {
    const body = await req.json()
    if (text(body?.honeypot, 200)) return json({ ok: true })
    const landingKey = text(body?.landing_key, 200)
    const input = body?.data
    if (!landingKey || !input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Falta la clave o los datos del formulario.' }, 400)
    const admin = adminClient()
    const { data: landing, error: landingError } = await admin.from('landings').select('id,company_id,name,allowed_origins,is_active').eq('endpoint_key', landingKey).maybeSingle()
    if (landingError) throw landingError
    if (!landing || !landing.is_active) return json({ error: 'Landing no encontrada o desactivada.' }, 404)
    const origin = req.headers.get('origin')
    if (origin && landing.allowed_origins?.length && !landing.allowed_origins.includes(origin)) return json({ error: 'Origen no autorizado.' }, 403, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' })

    const { data: fieldRows, error: fieldsError } = await admin.from('notice_fields').select('*').eq('company_id', landing.company_id)
    if (fieldsError) throw fieldsError
    const activeFields = (fieldRows || []).filter(f => f.visible_in_form && (!f.landing_id || f.landing_id === landing.id))
    const lookup = (key: string, alt?: string) => input[key] ?? (alt ? input[alt] : undefined)
    const customerName = text(lookup('customer_name','name'), 160)
    const phone = text(lookup('phone','telephone'), 60)
    const device = text(lookup('device','appliance'), 120)
    const missing = activeFields.filter(f => f.required && !text(input[f.field_key] ?? (f.field_key === 'customer_name' ? customerName : f.field_key === 'phone' ? phone : f.field_key === 'device' ? device : ''), 1000)).map(f => f.label)
    if (!customerName || !phone || missing.length) return json({ error: 'Completa los campos obligatorios: ' + [...new Set(['customerName','phone',...missing])].join(', ') }, 400)
    const known = new Set(['customer_name','name','phone','telephone','email','locality','postal_code','device','appliance','brand','issue','problem','message'])
    const customFields: Record<string,unknown> = {}
    for (const field of activeFields) if (!known.has(field.field_key) && input[field.field_key] !== undefined) customFields[field.field_key] = typeof input[field.field_key] === 'string' ? text(input[field.field_key], 2000) : input[field.field_key]
    const deviceName = device || text(lookup('device','appliance'),120)
    const notice = {
      company_id: landing.company_id,
      landing_id: landing.id,
      status: 'Nuevo',
      customer_name: customerName,
      phone,
      email: text(lookup('email'), 180) || null,
      locality: text(lookup('locality'), 120) || null,
      postal_code: text(lookup('postal_code'), 20) || null,
      device: deviceName || null,
      category: categoryFor(deviceName),
      brand: text(lookup('brand'), 100) || null,
      issue: text(lookup('issue','problem') ?? lookup('message'), 4000) || null,
      custom_fields: customFields,
      unit_price: 0,
    }
    const { data: inserted, error: insertError } = await admin.from('notices').insert(notice).select().single()
    if (insertError) throw insertError
    const delivery = await sendNoticeNotifications(admin, landing.company_id, inserted, landing.name)
    return json({ ok: true, notice_id: inserted.id, notifications: delivery }, 201, origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {})
  } catch (error) {
    console.error('service-form', error)
    return json({ error: error instanceof Error ? error.message : 'No se pudo registrar el aviso.' }, 400)
  }
})
