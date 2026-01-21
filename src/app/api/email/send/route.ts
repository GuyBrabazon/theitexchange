import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendOutlookMail } from '@/lib/outlook'
import { EmailLine, getCurrencySymbol as getBatchCurrencySymbol, buildBatchBody, buildBatchSubject } from '@/lib/emailBatch'
import { buildDealBody, buildDealSubject, getCurrencySymbol as getDealCurrencySymbol } from '@/lib/dealEmail'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    const { supa, user, tenantId } = auth
    const payload = await request.json()
    const {
      batchId,
      dealId,
      threadId,
      toEmail,
      buyerName,
      subject,
      personalMessage,
      subjectTemplate,
      subjectKey,
    } = payload

    if (!toEmail) {
      return NextResponse.json({ ok: false, message: 'Recipient email required' }, { status: 400 })
    }

    if (dealId && threadId) {
      const { data: deal, error: dealErr } = await supa
        .from('deals')
        .select('id,title,currency,status,buyer:buyers(id,name,email,company)')
        .eq('id', dealId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (dealErr || !deal) {
        return NextResponse.json(
          { ok: false, message: dealErr?.message || 'Deal not found' },
          { status: 404 }
        )
      }
      const buyerRow = Array.isArray(deal.buyer) ? deal.buyer[0] : deal.buyer

      const { data: thread, error: threadErr } = await supa
        .from('deal_threads')
        .select('id,subject_key')
        .eq('id', threadId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (threadErr || !thread) {
        return NextResponse.json(
          { ok: false, message: threadErr?.message || 'Thread not found' },
          { status: 404 }
        )
      }

      const { data: dealLines, error: linesErr } = await supa
        .from('deal_lines')
        .select(
          'line_ref,qty,ask_price,currency,model,description,oem,inventory_item_id,inventory_items(id,sku,model,description)'
        )
        .eq('deal_id', dealId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
      if (linesErr) throw linesErr

      const linesForEmail = (dealLines ?? []).map((line) => {
        const inventory = (line as { inventory_items?: { sku?: string; model?: string; description?: string } })
          ?.inventory_items
        const partNumber =
          inventory?.sku ?? inventory?.model ?? line.oem ?? line.model ?? ''
        const description =
          line.description ?? inventory?.description ?? line.model ?? null
        return {
          line_ref: line.line_ref,
          part_number: partNumber || line.model || 'Item',
          model: line.model,
          description,
          qty: line.qty ?? 1,
          ask_price: line.ask_price ?? null,
          currency: line.currency ?? deal.currency ?? 'USD',
        }
      })

      const dealCurrency = deal.currency ?? 'USD'
      const currencySymbol = getDealCurrencySymbol(dealCurrency)
      const finalSubject =
        subject ??
        buildDealSubject(subjectTemplate || deal.title || 'Deal conversation', subjectKey ?? thread.subject_key)
      const body = buildDealBody({
        lines: linesForEmail,
        buyerName: buyerName ?? buyerRow?.name ?? buyerRow?.company ?? undefined,
        message: personalMessage,
        currencySymbol,
      })

      await sendOutlookMail(user.id, toEmail, finalSubject, body)

      await supa
        .from('deals')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', dealId)

      return NextResponse.json({ ok: true })
    }

    if (!batchId) {
      return NextResponse.json(
        { ok: false, message: 'batchId or dealId plus threadId are required' },
        { status: 400 }
      )
    }

    const { data: batch, error: batchErr } = await supa
      .from('lot_email_batches')
      .select('id,lot_id,batch_key,subject,currency,tenant_id,status')
      .eq('id', batchId)
      .single()
    if (batchErr || !batch) {
      return NextResponse.json({ ok: false, message: batchErr?.message || 'Batch not found' }, { status: 404 })
    }
    if (batch.tenant_id !== tenantId) {
      return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
    }

    const { data: lot, error: lotErr } = await supa
      .from('lots')
      .select('id,type,title,currency')
      .eq('id', batch.lot_id)
      .single()
    if (lotErr || !lot) {
      return NextResponse.json({ ok: false, message: lotErr?.message || 'Lot not found' }, { status: 404 })
    }

    const { data: lineRows, error: lineErr } = await supa
      .from('line_items')
      .select(
        'line_ref,model,description,qty,asking_price,inventory_items:inventory_items(id,sku,model,description)'
      )
      .eq('lot_id', batch.lot_id)
      .order('created_at', { ascending: true })
    if (lineErr) throw lineErr

    const lines: EmailLine[] = (lineRows ?? []).map((row) => {
      const inventory = (row as { inventory_items?: { sku?: string; model?: string; description?: string } })?.inventory_items
      const partNumber =
        inventory?.sku ?? inventory?.model ?? (row as { model?: string })?.model ?? ''
      const description =
        (row as { description?: string })?.description ?? inventory?.description ?? null
      return {
        lineRef: (row as { line_ref?: string })?.line_ref || '',
        partNumber,
        description,
        qty:
          typeof (row as { qty?: number })?.qty === 'number'
            ? (row as { qty?: number }).qty ?? null
            : null,
        askingPrice:
          typeof (row as { asking_price?: number })?.asking_price === 'number'
            ? (row as { asking_price?: number }).asking_price ?? null
            : null,
      }
    })

    const currency = batch.currency ?? lot.currency ?? 'USD'
    const currencySymbol = getBatchCurrencySymbol(currency)
    const subjectLine = batch.subject || buildBatchSubject(batch.batch_key, lot.type || lot.title || 'Lot')
    const body = buildBatchBody({ lines, currencySymbol, buyerName })

    await sendOutlookMail(user.id, toEmail, subjectLine, body)

    await supa.from('lot_email_batches').update({ status: 'sent' }).eq('id', batch.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('email send error', err)
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
