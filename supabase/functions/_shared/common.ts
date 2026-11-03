import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } })
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  return error ? null : data.user
}

export async function companyRole(admin: SupabaseClient, companyId: string, userId: string) {
  const { data, error } = await admin.from('company_members').select('role').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.role || null
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}
async function encryptionKey() {
  const raw = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!raw) throw new Error('Missing server key')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw + ':crm-service-integrations:v1'))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt','decrypt'])
}

export async function encryptConfig(config: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await encryptionKey()
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(config)))
  return JSON.stringify({ iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) })
}

export async function decryptConfig(value: string) {
  const payload = JSON.parse(value)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv) }, await encryptionKey(), base64ToBytes(payload.data))
  return JSON.parse(new TextDecoder().decode(plain))
}

function htmlEscape(text: string) {
  return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
}

export async function sendNoticeNotifications(admin: SupabaseClient, companyId: string, notice: Record<string,any>, landingName: string, test = false, onlyKind?: string) {
  const { data, error } = await admin.from('company_integrations').select('kind,enabled,encrypted_config').eq('company_id', companyId).eq('enabled', true)
  if (error) throw error
  const results: { kind: string; ok: boolean; error?: string }[] = []
  for (const item of (data || []).filter(x => !onlyKind || x.kind === onlyKind)) {
    try {
      const config = await decryptConfig(item.encrypted_config)
      const time = new Date().toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'})
      const title = test ? 'Prueba de CRM Servicio Técnico' : 'Nuevo aviso recibido'
      const message = test ? 'La conexión de notificaciones está funcionando.' : `${title}\nLanding: ${landingName}\nHora: ${time}\nCliente: ${notice.customer_name || '—'}\nTeléfono: ${notice.phone || '—'}\nAparato: ${notice.device || '—'}\nAvería: ${notice.issue || '—'}`
      if (item.kind === 'telegram') {
        const response = await fetch(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: config.chat_id, text: message }),
        })
        if (!response.ok) throw new Error(`Telegram respondió ${response.status}`)
      } else if (item.kind === 'email') {
        const to = Array.isArray(config.to) ? config.to : [config.to]
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${config.api_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.from, to, subject: title, text: message, html: `<pre style="font:14px sans-serif;white-space:pre-wrap">${htmlEscape(message)}</pre>` }),
        })
        if (!response.ok) throw new Error(`Correo respondió ${response.status}`)
      }
      results.push({ kind: item.kind, ok: true })
    } catch (error) {
      results.push({ kind: item.kind, ok: false, error: error instanceof Error ? error.message : 'Error de integración' })
    }
  }
  return results
}
