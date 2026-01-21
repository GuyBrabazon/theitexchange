import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(_request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const { supa, tenantId } = auth
  try {
    const { data: deal, error: dealErr } = await supa
      .from('deals')
      .select('id,title,status,currency,source,last_activity_at,expected_close_date,stage_notes,buyer:buyers(id,name,company,email)')
      .eq('tenant_id', tenantId)
      .eq('id', params.id)
      .maybeSingle()
    if (dealErr) throw dealErr
    if (!deal) {
      return NextResponse.json({ ok: false, message: 'Deal not found' }, { status: 404 })
    }

    const { data: lines, error: linesErr } = await supa
      .from('deal_lines')
      .select('id,line_ref,source,qty,ask_price,currency,status,model,description,oem,inventory_item_id')
      .eq('tenant_id', tenantId)
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true })
    if (linesErr) throw linesErr

    const { data: threads, error: threadsErr } = await supa
      .from('deal_threads')
      .select('id,buyer_email,subject_key,subject_template,status,created_at')
      .eq('tenant_id', tenantId)
      .eq('deal_id', params.id)
      .order('created_at', { ascending: false })
    if (threadsErr) throw threadsErr

    const { data: offers, error: offersErr } = await supa
      .from('email_offers')
      .select(
        'id,buyer_email,buyer_name,received_at,status,deal_thread_id,email_offer_lines(line_ref,offer_amount,offer_type,qty)'
      )
      .eq('tenant_id', tenantId)
      .eq('deal_id', params.id)
      .order('received_at', { ascending: false })
    if (offersErr) throw offersErr

    return NextResponse.json({ ok: true, deal, lines: lines ?? [], threads: threads ?? [], offers: offers ?? [] })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
