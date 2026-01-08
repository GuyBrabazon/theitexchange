import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type RfqLineInput = {
  inventory_item_id: string
  qty_requested?: number | null
  note?: string | null
}

export async function POST(request: Request) {
  try {
    const supa = supabaseServer()
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '')
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id,name,company,phone').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })

    const body = (await request.json()) as {
      supplier_tenant_id?: string
      subject?: string
      note?: string
      lines?: RfqLineInput[]
    }

    if (!body?.supplier_tenant_id) {
      return NextResponse.json({ ok: false, message: 'supplier_tenant_id is required' }, { status: 400 })
    }

    const lines = Array.isArray(body.lines) ? body.lines.filter((l) => l?.inventory_item_id) : []
    if (!lines.length) {
      return NextResponse.json({ ok: false, message: 'At least one line is required' }, { status: 400 })
    }

    const { data: tenantRow, error: tenantErr } = await supa.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle()
    if (tenantErr) throw tenantErr

    const requester_name = profile?.name ?? user.user_metadata?.full_name ?? null
    const requester_email = user.email ?? null
    const requester_phone = profile?.phone ?? null
    const requester_company = profile?.company ?? tenantRow?.name ?? null

    const { data: rfq, error: rfqErr } = await supa
      .from('rfqs')
      .insert({
        buyer_tenant_id: profile.tenant_id,
        supplier_tenant_id: body.supplier_tenant_id,
        subject: body.subject ?? null,
        note: body.note ?? null,
        status: 'new',
        created_by: user.id,
        requester_name,
        requester_email,
        requester_phone,
        requester_company,
      })
      .select('id')
      .maybeSingle()

    if (rfqErr) throw rfqErr
    if (!rfq?.id) throw new Error('RFQ insert failed')

    const linePayloads = lines.map((l) => ({
      rfq_id: rfq.id,
      inventory_item_id: l.inventory_item_id,
      qty_requested: l.qty_requested ?? null,
      note: l.note ?? null,
    }))

    const { error: linesErr } = await supa.from('rfq_lines').insert(linePayloads)
    if (linesErr) throw linesErr

    return NextResponse.json({ ok: true, rfq_id: rfq.id })
  } catch (e) {
    console.error('rfq create error', e)
    const msg = e instanceof Error ? e.message : 'RFQ create failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
