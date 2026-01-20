import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const SOURCE_FIELDS = ['manufacturer', 'system_model_id', 'component_type', 'part_number', 'description'] as const

const normalizePartNumber = (value: string) => value.trim().toUpperCase()

async function resolveToken(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get('sb-access-token')?.value
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
  return bearerToken || cookieToken
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 })
    }

    for (const field of SOURCE_FIELDS) {
      if (!payload[field] || typeof payload[field] !== 'string' || !payload[field].trim()) {
        return NextResponse.json({ ok: false, message: `${field} is required` }, { status: 400 })
      }
    }

    const token = await resolveToken(request)
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profileErr) throw profileErr

    let role = profile?.role ?? null
    if (!role) {
      const { data: userRecord, error: userRecordErr } = await supa
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (userRecordErr) throw userRecordErr
      role = userRecord?.role ?? null
    }

    if (role !== 'admin') {
      return NextResponse.json({ ok: false, message: 'Only admin users can add global parts' }, { status: 403 })
    }

    const { system_model_id, component_type, manufacturer, description } = payload
    const normalizedPart = normalizePartNumber(payload.part_number)

    const { data: systemModel, error: systemErr } = await supa
      .from('system_models')
      .select('id')
      .eq('id', system_model_id)
      .maybeSingle()
    if (systemErr) throw systemErr
    if (!systemModel) {
      return NextResponse.json({ ok: false, message: 'System model not found' }, { status: 404 })
    }

    const { data: existingComponent } = await supa
      .from('component_models')
      .select('id')
      .eq('part_number', normalizedPart)
      .is('tenant_id', null)
      .maybeSingle()

    let componentId: string
    if (existingComponent?.id) {
      componentId = existingComponent.id
    } else {
      const { data: newComponent, error: createErr } = await supa
        .from('component_models')
        .insert({
          component_type,
          manufacturer,
          model: normalizedPart,
          part_number: normalizedPart,
          description: description.trim(),
          tenant_id: null,
          status: 'active',
        })
        .select('id')
        .single()
      if (createErr) throw createErr
      componentId = newComponent?.id
    }

    if (!componentId) {
      throw new Error('Failed to determine component')
    }

    const { data: existingRule } = await supa
      .from('compat_rules_global_models')
      .select('id')
      .eq('system_model_id', system_model_id)
      .eq('component_model_id', componentId)
      .maybeSingle()

    if (!existingRule?.id) {
      const { error: compatErr } = await supa.from('compat_rules_global_models').insert({
        system_model_id,
        component_model_id: componentId,
        status: 'verified',
      })
      if (compatErr) throw compatErr
    }

    return NextResponse.json({ ok: true, message: 'Part and compatibility saved' })
  } catch (error) {
    console.error('add part relationship error', error)
    const message = error instanceof Error ? error.message : 'Failed to add part relationship'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
