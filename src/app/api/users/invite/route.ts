import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const allowedRoles = ['admin', 'broker', 'ops', 'finance', 'readonly']

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) throw new Error('Supabase env missing')

    const authHeader = req.headers.get('authorization')
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('sb-access-token')?.value
    const token = authHeader?.replace(/Bearer\\s+/i, '') || cookieToken
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as { email: string; role?: string }
    const email = body.email?.trim().toLowerCase()
    const role = body.role && allowedRoles.includes(body.role) ? body.role : 'broker'
    if (!email) return NextResponse.json({ ok: false, message: 'Email is required' }, { status: 400 })

    // Service client for admin actions + user lookup
    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    if (profile.role !== 'admin') return NextResponse.json({ ok: false, message: 'Only admins can invite users' }, { status: 403 })
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`

    const { data: inviteRes, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (inviteErr) throw inviteErr

    const invitedId = inviteRes?.user?.id ?? null
    if (invitedId) {
      const { error: upErr } = await supa
        .from('users')
        .upsert(
          {
            id: invitedId,
            tenant_id: profile.tenant_id,
            role,
          },
          { onConflict: 'id' }
        )
      if (upErr) throw upErr
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('invite error', e)
    const msg = e instanceof Error ? e.message : 'Failed to invite user'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
