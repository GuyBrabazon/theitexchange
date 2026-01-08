import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendOutlookMail } from '@/lib/outlook'

export const runtime = 'nodejs'

type QuoteItemInput = {
  inventory_item_id: string
  qty: number
  price?: number | null
  currency?: string | null
}

export async function POST(req: Request) {
  const supa = supabaseServer()
  try {
    const body = (await req.json()) as {
      user_id: string
      buyer_id: string
      items: QuoteItemInput[]
      note?: string
      subject?: string
      preferred_currency?: string | null
    }

    if (!body.user_id) return NextResponse.json({ ok: false, message: 'user_id required' }, { status: 400 })
    if (!body.buyer_id) return NextResponse.json({ ok: false, message: 'buyer_id required' }, { status: 400 })
    if (!body.items?.length) return NextResponse.json({ ok: false, message: 'No items to quote' }, { status: 400 })

    const itemIds = body.items.map((i) => i.inventory_item_id)
    const { data: buyer, error: buyerErr } = await supa
      .from('buyers')
      .select('id,name,email,company,tenant_id')
      .eq('id', body.buyer_id)
      .maybeSingle()
    if (buyerErr) throw buyerErr
    if (!buyer) return NextResponse.json({ ok: false, message: 'Buyer not found' }, { status: 404 })
    if (!buyer.email) return NextResponse.json({ ok: false, message: 'Buyer has no email on file' }, { status: 400 })

    const { data: items, error: itemsErr } = await supa
      .from('inventory_items')
      .select('id,tenant_id,model,description,oem,qty_available,currency,cost')
      .in('id', itemIds)
      .eq('tenant_id', buyer.tenant_id)
    if (itemsErr) throw itemsErr
    if (!items || items.length !== itemIds.length) {
      return NextResponse.json({ ok: false, message: 'Some inventory items were not found or not in this tenant' }, { status: 400 })
    }

    for (const item of body.items) {
      const match = items.find((i) => i.id === item.inventory_item_id)
      if (!match) return NextResponse.json({ ok: false, message: 'Inventory mismatch' }, { status: 400 })
      const qty = Number(item.qty)
      if (!qty || qty <= 0) return NextResponse.json({ ok: false, message: 'Invalid qty' }, { status: 400 })
      if (match.qty_available != null && qty > match.qty_available) {
        return NextResponse.json(
          { ok: false, message: `Insufficient qty for ${match.model || match.description || match.id}` },
          { status: 400 }
        )
      }
    }

    const subject =
      body.subject || `Quote: ${buyer.company || buyer.name || 'your request'} (${body.items.length} item${body.items.length > 1 ? 's' : ''})`

    const rowsHtml = items
      .map((it) => {
        const payload = body.items.find((p) => p.inventory_item_id === it.id)!
        const price = payload.price ?? it.cost ?? null
        const currency = payload.currency ?? it.currency ?? body.preferred_currency ?? 'USD'
        const priceStr = price != null ? Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price) : '—'
        const qty = payload.qty
        return `<tr>
          <td style="padding:6px;border:1px solid #d6dce3;">${it.model || it.description || 'Item'}</td>
          <td style="padding:6px;border:1px solid #d6dce3;">${it.oem || ''}</td>
          <td style="padding:6px;border:1px solid #d6dce3;text-align:right;">${qty}</td>
          <td style="padding:6px;border:1px solid #d6dce3;text-align:right;">${priceStr}</td>
          <td style="padding:6px;border:1px solid #d6dce3;">${currency}</td>
        </tr>`
      })
      .join('')

    const noteBlock = body.note ? `<p style="margin:0 0 12px;">${body.note}</p>` : ''
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1f2933;">
        <p style="margin:0 0 12px;">Hi ${buyer.name || 'there'},</p>
        ${noteBlock}
        <p style="margin:0 0 8px;">Here is your quote:</p>
        <table style="border-collapse:collapse;width:100%;max-width:900px;margin-bottom:16px;">
          <thead>
            <tr style="background:#eef2f6;">
              <th style="padding:8px;border:1px solid #d6dce3;text-align:left;">Model / Description</th>
              <th style="padding:8px;border:1px solid #d6dce3;text-align:left;">OEM</th>
              <th style="padding:8px;border:1px solid #d6dce3;text-align:right;">Qty</th>
              <th style="padding:8px;border:1px solid #d6dce3;text-align:right;">Price</th>
              <th style="padding:8px;border:1px solid #d6dce3;text-align:left;">Currency</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin:0 0 12px;">Let me know if you have any questions.</p>
        <p style="margin:0;">Regards,<br/>The IT Exchange</p>
      </div>
    `

    // Persist quote + lines
    const nowIso = new Date().toISOString()
    const { data: quoteRow, error: quoteErr } = await supa
      .from('quotes')
      .insert({
        tenant_id: buyer.tenant_id,
        buyer_id: buyer.id,
        status: 'sent',
        subject,
        note: body.note ?? null,
        sent_at: nowIso,
        created_by: body.user_id,
      })
      .select('id')
      .single()
    if (quoteErr) throw quoteErr
    const quoteId: string = (quoteRow as { id: string }).id

    const linePayload = body.items.map((item) => {
      const match = items.find((i) => i.id === item.inventory_item_id)!
      const price = item.price ?? match.cost ?? null
      const currency = item.currency ?? match.currency ?? body.preferred_currency ?? 'USD'
      return {
        quote_id: quoteId,
        inventory_item_id: match.id,
        description: match.description ?? match.model ?? null,
        model: match.model ?? null,
        oem: match.oem ?? null,
        qty: item.qty,
        price,
        currency,
        cost_snapshot: match.cost ?? null,
      }
    })
    const { error: qlErr } = await supa.from('quote_lines').insert(linePayload)
    if (qlErr) throw qlErr

    await sendOutlookMail(body.user_id, buyer.email, subject, html)

    const movementPayload = body.items.map((item) => {
      const match = items.find((i) => i.id === item.inventory_item_id)!
      const reason = `quote:${JSON.stringify({
        buyer_id: buyer.id,
        buyer_email: buyer.email,
        buyer_name: buyer.name,
        price: item.price ?? match.cost ?? null,
        qty: item.qty,
        subject,
      })}`
      return {
        inventory_item_id: match.id,
        tenant_id: buyer.tenant_id,
        change_type: 'adjust' as const,
        qty_delta: 0,
        reason,
      }
    })

    const { error: movErr } = await supa.from('inventory_movements').insert(movementPayload)
    if (movErr) throw movErr

    return NextResponse.json({ ok: true, quote_id: quoteId })
  } catch (e) {
    console.error('quote send error', e)
    const msg = e instanceof Error ? e.message : 'Failed to send quote'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
