import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function adminClient() {
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

const allowedRoles = new Set(['gestor', 'consulta'])
const allowedIcons = new Set(['user', 'tool', 'wrench', 'case', 'star', 'office'])
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
  const actor = await authenticatedUser(req)
  if (!actor) return json({ error: 'Debes iniciar sesión.' }, 401)
  const admin = adminClient()
  try {
    const body = await req.json()
    const action = String(body?.action || '')
    const companyId = String(body?.company_id || '')
    if (!companyId) return json({ error: 'Selecciona una empresa.' }, 400)

    const { data: superAdmin, error: superAdminError } = await admin.from('global_admins').select('user_id').eq('user_id', actor.id).maybeSingle()
    if (superAdminError) throw superAdminError
    if (!superAdmin) return json({ error: 'Solo el superadministrador puede gestionar usuarios.' }, 403)

    if (action === 'create') {
      const email = String(body?.email || '').trim().toLowerCase()
      const password = String(body?.password || '')
      const role = String(body?.role || '')
      const avatarIcon = String(body?.avatar_icon || '')
      if (!validEmail(email) || !allowedRoles.has(role)) return json({ error: 'Correo o rol no válido.' }, 400)
      if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
      if (avatarIcon && !allowedIcons.has(avatarIcon)) return json({ error: 'El icono seleccionado no es válido.' }, 400)

      const { data: existingMember, error: existingMemberError } = await admin.from('company_members').select('company_id').eq('email', email).maybeSingle()
      if (existingMemberError) throw existingMemberError
      if (existingMember) return json({ error: existingMember.company_id === companyId ? 'Este usuario ya pertenece a esta empresa. Puedes cambiar su rol o contraseña desde su ficha.' : 'Este usuario ya pertenece a otra empresa.' }, 409)

      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (createError) {
        const message = createError.message || ''
        if (/already|registered|exists|duplicate/i.test(message)) return json({ error: 'Ya existe una cuenta con ese correo. Usa «Invitar por correo» para asociarla a esta empresa.' }, 409)
        throw createError
      }
      if (!created.user) throw new Error('No se pudo crear la cuenta.')
      const { data: globalAccount, error: globalAccountError } = await admin.from('global_admins').select('user_id').eq('user_id', created.user.id).maybeSingle()
      if (globalAccountError) {
        await admin.auth.admin.deleteUser(created.user.id)
        throw globalAccountError
      }
      if (globalAccount) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: 'La cuenta superadministradora no se puede añadir como usuario normal.' }, 409)
      }
      const { error: insertError } = await admin.from('company_members').insert({
        company_id: companyId,
        user_id: created.user.id,
        email,
        role,
        avatar_icon: avatarIcon || 'user',
      })
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id)
        throw insertError
      }
      return json({ ok: true, email, user_id: created.user.id })
    }

    const userId = String(body?.user_id || '')
    if (!userId || userId === actor.id) return json({ error: 'Selecciona un usuario válido.' }, 400)
    const { data: member, error: memberError } = await admin.from('company_members').select('user_id').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return json({ error: 'El usuario no pertenece a esta empresa.' }, 404)
    const { data: targetSuperAdmin, error: targetSuperAdminError } = await admin.from('global_admins').select('user_id').eq('user_id', userId).maybeSingle()
    if (targetSuperAdminError) throw targetSuperAdminError
    if (targetSuperAdmin) return json({ error: 'No se puede modificar una cuenta superadministradora desde esta pantalla.' }, 409)

    if (action === 'update_role') {
      const role = String(body?.role || '')
      if (!allowedRoles.has(role)) return json({ error: 'El rol seleccionado no es válido.' }, 400)
      const { error } = await admin.from('company_members').update({ role }).eq('company_id', companyId).eq('user_id', userId)
      if (error) throw error
      return json({ ok: true })
    }
    if (action === 'set_password') {
      const password = String(body?.password || '')
      if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      return json({ ok: true })
    }
    return json({ error: 'La operación solicitada no es válida.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'No se pudo gestionar el usuario.' }, 400)
  }
})
