import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { insertDealLine } from '@/lib/deals'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  try {
    const body = await request.json()
    const {
      source,
      line_ref,
      qty,
      ask_price,
      currency,
      model,
      description,
      oem,
      inventory_item_id,
      inventory_unit_id,
      meta,
      status,
    } = body
    if (!source || !line_ref) {
      return NextResponse.json({ ok: false, message: 'source and line_ref are required' }, { status: 400 })
    }
    const dealLine = await insertDealLine(auth.supa, {
      deal_id: context.params.id,
      tenant_id: auth.tenantId,
      source,
      line_ref,
      qty: qty ?? 1,
      ask_price: ask_price ?? null,
      currency: currency ?? null,
      model: model ?? null,
      description: description ?? null,
      oem: oem ?? null,
      inventory_item_id: inventory_item_id ?? null,
      inventory_unit_id: inventory_unit_id ?? null,
      meta: meta ?? {},
      status: status ?? 'draft',
    })
    return NextResponse.json({ ok: true, dealLine })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
