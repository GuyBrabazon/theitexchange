import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type LookupResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: 'not_found' | 'same_tenant' | 'not_discoverable'; message?: string }

const buildAddressLines = (input: string | null | undefined) => {
  const address = (input ?? '').trim()
  if (!address) return { address_line1: '', address_line2: '' }
  const lines = address
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return { address_line1: address, address_line2: '' }
  return {
    address_line1: lines[0],
    address_line2: lines.slice(1).join(', '),
  }
}

export async function POST(req: Request) {
  try {
    const supa = supabaseServer()
    const authHeader = req.headers.get('authorization') ?? ''
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('sb-access-token')?.value
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
    const token = bearerToken || cookieToken
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as { email?: string }
    const email = body.email?.trim().toLowerCase()
    if (!email) return NextResponse.json({ ok: false, message: 'Email is required' }, { status: 400 })

    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: requesterProfile, error: requesterErr } = await supa
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()
    if (requesterErr) throw requesterErr
    const requesterTenant = requesterProfile?.tenant_id
    if (!requesterTenant) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })

    const { data: authRow, error: authErr } = await supa
      .schema('auth')
      .from('users')
      .select('id,email')
      .ilike('email', email)
      .maybeSingle()
    if (authErr) throw authErr
    if (!authRow?.id) {
      const resp: LookupResult = { ok: false, reason: 'not_found', message: 'This user is not a user of The IT Exchange' }
      return NextResponse.json(resp, { status: 404 })
    }

    const { data: targetProfile, error: targetErr } = await supa
      .from('users')
      .select('id,tenant_id,name,company,phone')
      .eq('id', authRow.id)
      .maybeSingle()
    if (targetErr) throw targetErr
    if (!targetProfile?.tenant_id) {
      const resp: LookupResult = { ok: false, reason: 'not_found', message: 'This user is not a user of The IT Exchange' }
      return NextResponse.json(resp, { status: 404 })
    }

    if (targetProfile.tenant_id === requesterTenant) {
      const resp: LookupResult = { ok: false, reason: 'same_tenant', message: 'User is already in your organisation' }
      return NextResponse.json(resp, { status: 400 })
    }

    const [{ data: tenantRow, error: tenantErr }, { data: settingsRow, error: settingsErr }] = await Promise.all([
      supa.from('tenants').select('name').eq('id', targetProfile.tenant_id).maybeSingle(),
      supa
        .from('tenant_settings')
        .select('discoverable,accounts_email,registered_address')
        .eq('tenant_id', targetProfile.tenant_id)
        .maybeSingle(),
    ])

    if (tenantErr) throw tenantErr
    if (settingsErr) throw settingsErr
    if (!settingsRow?.discoverable) {
      const resp: LookupResult = { ok: false, reason: 'not_discoverable', message: 'Tenant details are not discoverable' }
      return NextResponse.json(resp, { status: 403 })
    }

    const addressLines = buildAddressLines(settingsRow.registered_address ?? '')
    const payload = {
      linked_tenant_id: targetProfile.tenant_id,
      tenant_name: tenantRow?.name ?? null,
      company_name: tenantRow?.name ?? targetProfile.company ?? null,
      contact_name: targetProfile.name ?? null,
      contact_email: authRow.email ?? null,
      contact_phone: targetProfile.phone ?? null,
      accounts_email: settingsRow.accounts_email ?? null,
      address_line1: addressLines.address_line1 || null,
      address_line2: addressLines.address_line2 || null,
    }

    const resp: LookupResult = { ok: true, data: payload }
    return NextResponse.json(resp)
  } catch (e) {
    console.error('customer lookup error', e)
    const msg = e instanceof Error ? e.message : 'Lookup failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
