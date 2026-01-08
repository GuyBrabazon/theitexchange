import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const allowedRoles = ['admin', 'broker', 'ops', 'finance', 'readonly']

export async function POST(req: Request) {
  try {
    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser()
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as { email: string; role?: string }
    const email = body.email?.trim().toLowerCase()
    const role = body.role && allowedRoles.includes(body.role) ? body.role : 'broker'
    if (!email) return NextResponse.json({ ok: false, message: 'Email is required' }, { status: 400 })

    // Ensure caller is admin and get tenant_id
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
