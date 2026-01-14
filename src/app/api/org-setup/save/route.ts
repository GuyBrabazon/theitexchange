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
      const { error: setErr } = await supa
        .from('tenant_settings')
        .upsert(
          {
            tenant_id: tenantId,
            default_currency: body.settings.default_currency ?? 'USD',
            margins_visible_to_brokers: body.settings.margins_visible_to_brokers ?? true,
            ops_can_edit_costs: body.settings.ops_can_edit_costs ?? false,
            require_finance_approval_for_award: body.settings.require_finance_approval_for_award ?? false,
            work_email_domain: body.settings.work_email_domain ?? null,
            discoverable: body.settings.discoverable ?? false,
            po_logo_path: body.settings.po_logo_path ?? null,
            po_brand_color: body.settings.po_brand_color ?? null,
            po_brand_color_secondary: body.settings.po_brand_color_secondary ?? null,
            po_terms: body.settings.po_terms ?? null,
            po_header: body.settings.po_header ?? null,
            po_number_start: body.settings.po_number_start ?? null,
            po_number_current: body.settings.po_number_current ?? null,
            accounts_email: body.settings.accounts_email ?? null,
            registered_address: body.settings.registered_address ?? null,
            eori: body.settings.eori ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' }
        )
      if (setErr) throw setErr
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('org setup save error', e)
    const msg = e instanceof Error ? e.message : 'Save failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
