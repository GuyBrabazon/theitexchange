import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supa = supabaseServer()
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '')
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const body = (await req.json()) as {
      tenant_id?: string
      tenant_name?: string
      settings?: {
        default_currency?: string | null
        margins_visible_to_brokers?: boolean
        ops_can_edit_costs?: boolean
        require_finance_approval_for_award?: boolean
        work_email_domain?: string | null
        discoverable?: boolean
        po_logo_path?: string | null
        po_brand_color?: string | null
        po_brand_color_secondary?: string | null
        po_terms?: string | null
        po_header?: string | null
        po_start_number?: number | null
        po_current_number?: number | null
        po_number_start?: number | null
        po_number_current?: number | null
        accounts_email?: string | null
        registered_address?: string | null
        eori?: string | null
      }
    }

    const tenantId = body.tenant_id
    if (!tenantId) return NextResponse.json({ ok: false, message: 'tenant_id required' }, { status: 400 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    if (profile.tenant_id !== tenantId) return NextResponse.json({ ok: false, message: 'Tenant mismatch' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ ok: false, message: 'Only admins can update org settings' }, { status: 403 })

    if (body.tenant_name) {
      const { error: upTenantErr } = await supa.from('tenants').update({ name: body.tenant_name }).eq('id', tenantId)
      if (upTenantErr) throw upTenantErr
    }

    if (body.settings) {
      const settings = body.settings
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      }
      const setIfDefined = (key: string, value: unknown) => {
        if (value !== undefined) payload[key] = value
      }
      const poStart = settings.po_start_number ?? settings.po_number_start
      const poCurrent = settings.po_current_number ?? settings.po_number_current

      setIfDefined('default_currency', settings.default_currency)
      setIfDefined('margins_visible_to_brokers', settings.margins_visible_to_brokers)
      setIfDefined('ops_can_edit_costs', settings.ops_can_edit_costs)
      setIfDefined('require_finance_approval_for_award', settings.require_finance_approval_for_award)
      setIfDefined('work_email_domain', settings.work_email_domain)
      setIfDefined('discoverable', settings.discoverable)
      setIfDefined('po_logo_path', settings.po_logo_path)
      setIfDefined('po_brand_color', settings.po_brand_color)
      setIfDefined('po_brand_color_secondary', settings.po_brand_color_secondary)
      setIfDefined('po_terms', settings.po_terms)
      setIfDefined('po_header', settings.po_header)
      setIfDefined('po_start_number', poStart)
      setIfDefined('po_current_number', poCurrent)
      setIfDefined('accounts_email', settings.accounts_email)
      setIfDefined('registered_address', settings.registered_address)
      setIfDefined('eori', settings.eori)

      const { error: setErr } = await supa.from('tenant_settings').upsert(payload, { onConflict: 'tenant_id' })
      if (setErr) throw setErr
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('org setup save error', e)
    const msg = e instanceof Error ? e.message : 'Save failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
