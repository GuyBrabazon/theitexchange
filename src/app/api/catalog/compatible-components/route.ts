import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const systemModelId = url.searchParams.get('system_model_id')
    if (!systemModelId) {
      return NextResponse.json({ ok: false, message: 'system_model_id required' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization') ?? ''
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('sb-access-token')?.value
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
    const token = bearerToken || cookieToken
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })

    const { data, error } = await supa.rpc('get_compatible_components', {
      p_system_model_id: systemModelId,
      p_tenant_id: profile.tenant_id,
    })
    if (error) throw error

    return NextResponse.json({ ok: true, items: data ?? [] })
  } catch (e) {
    console.error('compatible components error', e)
    const msg = e instanceof Error ? e.message : 'Failed to load compatible components'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
