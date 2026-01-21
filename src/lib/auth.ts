import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from './supabaseServer'

export async function resolveBearerToken(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim()
  if (bearer) return bearer
  const cookieStore = await cookies()
  return cookieStore.get('sb-access-token')?.value ?? ''
}

async function resolveTenantId(supa: ReturnType<typeof supabaseServer>, userId: string) {
  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supa.from('profiles').select('tenant_id').eq('id', userId).maybeSingle(),
    supa.from('users').select('tenant_id').eq('id', userId).maybeSingle(),
  ])
  return profile?.tenant_id ?? userRow?.tenant_id ?? null
}

export async function requireAuth(request: Request) {
  const token = await resolveBearerToken(request)
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
  }

  const supa = supabaseServer()
  const { data: userData, error: userErr } = await supa.auth.getUser(token)
  if (userErr) {
    return NextResponse.json({ ok: false, message: userErr.message }, { status: 401 })
  }
  const user = userData?.user
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
  }

  const tenantId = await resolveTenantId(supa, user.id)
  if (!tenantId) {
    return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
  }

  return { supa, user, tenantId, token }
}
