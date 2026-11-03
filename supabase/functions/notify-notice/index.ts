import { adminClient, authenticatedUser, corsHeaders, json, sendNoticeNotifications } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const user = await authenticatedUser(req)
  if (!user) return json({ error: 'Debes iniciar sesión.' }, 401)
  try {
    const { notice_id } = await req.json()
    const admin = adminClient()
    const { data: notice, error } = await admin.from('notices').select('*,landings(name)').eq('id', notice_id).maybeSingle()
    if (error) throw error
    if (!notice) return json({ error: 'Aviso no encontrado.' }, 404)
    const { data: membership } = await admin.from('company_members').select('user_id').eq('company_id', notice.company_id).eq('user_id', user.id).maybeSingle()
    if (!membership) return json({ error: 'No tienes acceso a esta empresa.' }, 403)
    const results = await sendNoticeNotifications(admin, notice.company_id, notice, notice.landings?.name || 'Entrada manual')
    return json({ ok: true, results })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo enviar el aviso.' }, 400)
  }
})
