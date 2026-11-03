import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notice-timestamp, x-notice-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  return error ? null : data.user
}

async function isSignedServiceCall(req: Request, noticeId: string) {
  const timestamp = req.headers.get('x-notice-timestamp') || ''
  const signature = req.headers.get('x-notice-signature') || ''
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 180 || !signature) return false
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}:${noticeId}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)))
  if (signature.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < signature.length; i++) difference |= signature.charCodeAt(i) ^ expected.charCodeAt(i)
  return difference === 0
}

async function decryptConfig(value: string) {
  const payload = JSON.parse(value)
  const raw = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw + ':crm-service-integrations:v1'))
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0)) }, key, Uint8Array.from(atob(payload.data), c => c.charCodeAt(0)))
  return JSON.parse(new TextDecoder().decode(plain))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json()
    const noticeId = String(body?.notice_id || '')
    if (!noticeId) return json({ error: 'Falta el identificador del aviso.' }, 400)

    const internal = await isSignedServiceCall(req, noticeId)
    const user = internal ? null : await authenticatedUser(req)
    if (!internal && !user) return json({ error: 'Debes iniciar sesión.' }, 401)

    const admin = adminClient()
    const { data: notice, error: noticeError } = await admin.from('notices')
      .select('id,company_id,customer_name,phone,device,received_at,landings(name)')
      .eq('id', noticeId).maybeSingle()
    if (noticeError) throw noticeError
    if (!notice) return json({ error: 'Aviso no encontrado.' }, 404)

    if (user) {
      const { data: membership, error } = await admin.from('company_members').select('user_id')
        .eq('company_id', notice.company_id).eq('user_id', user.id).maybeSingle()
      if (error) throw error
      if (!membership) return json({ error: 'No tienes acceso a esta empresa.' }, 403)
    }

    const { data: integration, error: integrationError } = await admin.from('company_integrations')
      .select('encrypted_config').eq('company_id', notice.company_id).eq('kind', 'whatsapp').eq('enabled', true).maybeSingle()
    if (integrationError) throw integrationError
    if (!integration) return json({ ok: true, skipped: 'WhatsApp no está configurado.' })

    const config = await decryptConfig(integration.encrypted_config)
    const fields = [
      notice.landings?.name || 'Entrada manual',
      new Date(notice.received_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }),
      notice.customer_name || '—',
      notice.phone || '—',
      notice.device || '—',
    ]
    const response = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(config.phone_number_id)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual', to: String(config.to).replace(/\D/g, ''), type: 'template',
        template: { name: config.template_name, language: { code: config.language || 'es' }, components: [{ type: 'body', parameters: fields.map(text => ({ type: 'text', text: String(text) })) }] },
      }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      throw new Error(result?.error?.message || `WhatsApp respondió ${response.status}`)
    }
    return json({ ok: true })
  } catch (error) {
    console.error('notify-whatsapp-notice', error)
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar el aviso por WhatsApp.' }, 400)
  }
})
