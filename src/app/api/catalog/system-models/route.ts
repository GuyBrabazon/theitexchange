import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const allowedMachineTypes = new Set(['server', 'storage', 'network'])

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const machineType = url.searchParams.get('machine_type') || ''
    const manufacturer = url.searchParams.get('manufacturer') || ''
    const family = url.searchParams.get('family') || ''

    if (machineType && !allowedMachineTypes.has(machineType)) {
      return NextResponse.json({ ok: false, message: 'Invalid machine type' }, { status: 400 })
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

    let query = supa
      .from('system_models')
      .select('id,tenant_id,machine_type,manufacturer,family,model,form_factor,tags')
      .or(`tenant_id.is.null,tenant_id.eq.${profile.tenant_id}`)
      .order('manufacturer', { ascending: true })
      .order('model', { ascending: true })

    if (machineType) query = query.eq('machine_type', machineType)
    if (manufacturer) query = query.eq('manufacturer', manufacturer)
    if (family) query = query.eq('family', family)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, items: data ?? [] })
  } catch (e) {
    console.error('system models error', e)
    const msg = e instanceof Error ? e.message : 'Failed to load system models'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
