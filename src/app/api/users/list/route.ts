import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) throw new Error('Supabase env missing')

    const authHeader = req.headers.get('authorization') ?? ''
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('sb-access-token')?.value
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
    const token = bearerToken || cookieToken
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const supaAnon = createClient(url, anon, { auth: { persistSession: false } })
    const {
      data: { user },
      error: userErr,
    } = await supaAnon.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const supa = supabaseServer()
    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    if (profile.role !== 'admin') return NextResponse.json({ ok: false, message: 'Only admins can view users' }, { status: 403 })

    const { data: users, error: usersErr } = await supa
      .from('users')
      .select('id,role,name,company,phone,created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (usersErr) throw usersErr

    return NextResponse.json({ ok: true, tenant_id: profile.tenant_id, role: profile.role, users: users ?? [] })
  } catch (e) {
    console.error('users list error', e)
    const msg = e instanceof Error ? e.message : 'Failed to load users'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
