import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supa = supabaseServer()
    const authHeader = req.headers.get('authorization') ?? (await headers()).get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '')
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    if (profile.role !== 'admin') return NextResponse.json({ ok: false, message: 'Only admins can purge inventory' }, { status: 403 })

    const { error } = await supa.from('inventory_items').delete().eq('tenant_id', profile.tenant_id).eq('status', 'available')
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('inventory purge error', e)
    const msg = e instanceof Error ? e.message : 'Failed to purge inventory'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
