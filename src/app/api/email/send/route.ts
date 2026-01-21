import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendOutlookMail } from '@/lib/outlook'
import { EmailLine, getCurrencySymbol, buildBatchBody, buildBatchSubject } from '@/lib/emailBatch'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { batchId, toEmail, buyerName } = (await request.json()) as {
      batchId?: string
      toEmail?: string
      buyerName?: string
    }
    if (!batchId || !toEmail) {
      return NextResponse.json({ ok: false, message: 'batchId and toEmail are required' }, { status: 400 })
    }

    const supa = supabaseServer()
    const authHeader =
      request.headers.get('Authorization') ?? request.headers.get('authorization') ?? undefined
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring('Bearer '.length)
      if (token) {
        supa.auth.setAuth(token)
      }
    }
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser()
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    const tenantId = profile?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
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
    const currencySymbol = getCurrencySymbol(currency)
    const subject = batch.subject || buildBatchSubject(batch.batch_key, lot.type || lot.title || 'Lot')
    const body = buildBatchBody({ lines, currencySymbol, buyerName })

    await sendOutlookMail(user.id, toEmail, subject, body)

    await supa.from('lot_email_batches').update({ status: 'sent' }).eq('id', batch.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('email send error', err)
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
