import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supa = supabaseServer()
  try {
    const body = (await req.json()) as { quote_id: string; user_id: string }
    if (!body.quote_id) return NextResponse.json({ ok: false, message: 'quote_id required' }, { status: 400 })
    if (!body.user_id) return NextResponse.json({ ok: false, message: 'user_id required' }, { status: 400 })

    const { data: quote, error: qErr } = await supa
      .from('quotes')
      .select('id,tenant_id,buyer_id,status,currency,subject')
      .eq('id', body.quote_id)
      .maybeSingle()
    if (qErr) throw qErr
    if (!quote) return NextResponse.json({ ok: false, message: 'Quote not found' }, { status: 404 })

    const { data: lines, error: lErr } = await supa
      .from('quote_lines')
      .select('id,inventory_item_id,description,model,oem,qty,price,currency')
      .eq('quote_id', body.quote_id)
    if (lErr) throw lErr
    if (!lines?.length) return NextResponse.json({ ok: false, message: 'Quote has no lines' }, { status: 400 })

    const currency = quote.currency || lines.find((l) => l.currency)?.currency || 'USD'
    const total = lines.reduce((s, r) => s + Number(r.price ?? 0) * Number(r.qty ?? 0), 0)

    const { data: soRow, error: soErr } = await supa
      .from('sales_orders')
      .insert({
        tenant_id: quote.tenant_id,
        buyer_id: quote.buyer_id,
        quote_id: quote.id,
        status: 'draft',
        currency,
        total,
        created_by: body.user_id,
      })
      .select('id')
      .single()
    if (soErr) throw soErr
    const soId: string = (soRow as { id: string }).id

    const linePayload = lines.map((l) => ({
      sales_order_id: soId,
      quote_line_id: l.id,
      inventory_item_id: l.inventory_item_id,
      description: l.description ?? l.model ?? null,
      model: l.model ?? null,
      oem: l.oem ?? null,
      qty: l.qty ?? 0,
      price: l.price ?? null,
      currency: l.currency ?? currency,
    }))
    const { error: solErr } = await supa.from('sales_order_lines').insert(linePayload)
    if (solErr) throw solErr

    await supa.from('quotes').update({ status: 'ordered', updated_at: new Date().toISOString() }).eq('id', quote.id)

    return NextResponse.json({ ok: true, sales_order_id: soId })
  } catch (e) {
    console.error('quote convert error', e)
    const msg = e instanceof Error ? e.message : 'Failed to convert quote'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
