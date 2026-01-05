import { NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type LineOffer = { line_item_id: string; unit_price: number; qty?: number | null }

type Body =
  | { mode: 'take_all'; take_all_total: number }
  | { mode: 'lines'; lines: LineOffer[] }

type OfferInsert = {
  lot_id: string
  buyer_id: string
  currency: string
  take_all_total?: number
}

type OfferRow = { id: string; status: string | null }

function toNum(v: unknown) {
  const x = Number(String(v ?? '').trim().replaceAll(',', ''))
  return Number.isFinite(x) ? x : null
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  let body: Body | null = null
  try {
    body = (await req.json()) as Body
  } catch {
    body = null
  }

  // 1) Validate invite
  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,tenant_id,lot_id,buyer_id,round_id,status')
    .eq('token', token)
    .single()

  if (invErr || !inv) return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })

  // 2) Load lot currency (and sanity)
  const { data: lot, error: lotErr } = await sb.from('lots').select('id,currency,status').eq('id', inv.lot_id).single()
  if (lotErr || !lot) return NextResponse.json({ error: lotErr?.message ?? 'Lot not found' }, { status: 404 })

  const currency = lot.currency ?? 'USD'

  // 3) Create offer row
  // We try status='submitted', but if your CHECK constraint rejects it, we retry with null.
  const baseOffer: OfferInsert = {
    lot_id: inv.lot_id,
    buyer_id: inv.buyer_id,
    currency,
  }

  // Attach take_all_total if take-all
  if (body?.mode === 'take_all') {
    const t = toNum(body.take_all_total)
    if (t == null || t <= 0) return NextResponse.json({ error: 'Invalid take-all total' }, { status: 400 })
    baseOffer.take_all_total = t
  }

  // Insert attempt #1
  let offerRow: OfferRow | null = null
  {
    const attempt = await sb.from('offers').insert({ ...baseOffer, status: 'submitted' }).select('id,status').single()

    if (!attempt.error) {
      offerRow = attempt.data
    } else {
      // If check constraint fails (23514) or unknown status, retry with status null
      const code = (attempt.error as PostgrestError | undefined)?.code
      if (code === '23514') {
        const retry = await sb.from('offers').insert({ ...baseOffer, status: null }).select('id,status').single()
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
        offerRow = retry.data
      } else if (code === '42703') {
        // Likely missing column like take_all_total; retry without extra fields
        const stripped = { lot_id: inv.lot_id, buyer_id: inv.buyer_id, currency }
        const retry = await sb.from('offers').insert({ ...stripped, status: null }).select('id,status').single()
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
        offerRow = retry.data
      } else {
        return NextResponse.json({ error: attempt.error.message }, { status: 500 })
      }
    }
  }

  const offerId = offerRow?.id
  if (!offerId) return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 })

  // Mark lot as offers_received if still draft/open
  try {
    await sb
      .from('lots')
      .update({ status: 'offers_received' })
      .eq('id', inv.lot_id)
      .in('status', ['draft', 'open'])
  } catch (e) {
    console.warn('offers_received status update skipped', e)
  }

  // If status is still offers_received/open/draft, consider marking awarded if accepted downstream

  // 4) If line-by-line, insert offer lines (optional table)
  if (body?.mode === 'lines') {
    const lines = Array.isArray(body.lines) ? body.lines : []
    if (!lines.length) return NextResponse.json({ error: 'No line offers provided' }, { status: 400 })

    const payload = lines
      .map((l) => {
        const unit = toNum(l.unit_price)
        const qty = l.qty == null ? null : toNum(l.qty)
        return {
          offer_id: offerId,
          lot_id: inv.lot_id,
          buyer_id: inv.buyer_id,
          line_item_id: l.line_item_id,
          unit_price: unit,
          qty: qty == null ? null : Math.round(qty),
          currency,
        }
      })
      .filter((r) => r.unit_price != null && r.unit_price > 0 && !!r.line_item_id)

    if (!payload.length) return NextResponse.json({ error: 'No usable line offers (need unit_price > 0)' }, { status: 400 })

    // If your table name differs, change 'offer_lines' below.
    const { error: insErr } = await sb.from('offer_lines').insert(payload)

    if (insErr) {
      const code = (insErr as PostgrestError | undefined)?.code
      if (code === '42P01') {
        return NextResponse.json(
          {
            error:
              "Your database doesn't have an 'offer_lines' table. Either create it, or change this endpoint to match your schema.",
          },
          { status: 500 }
        )
      }
      if (code === '42703') {
        return NextResponse.json(
          {
            error:
              "Column mismatch inserting offer lines. Check your 'offer_lines' columns (expected: offer_id, lot_id, buyer_id, line_item_id, unit_price, qty, currency).",
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    // 4b) Log component-level part observations (best-effort, no-op if helper is missing)
    try {
      const lineIds = payload.map((p) => p.line_item_id)
      const { data: items, error: itemsErr } = await sb
        .from('line_items')
        .select('id,lot_id,cpu,cpu_qty,memory_part_numbers,memory_qty,gpu,specs')
        .in('id', lineIds)
      if (!itemsErr && Array.isArray(items)) {
        const qtyByLine: Record<string, number> = {}
        for (const p of payload) {
          qtyByLine[p.line_item_id] = p.qty ?? 1
        }

        for (const it of items as Array<{
          id: string
          lot_id: string | null
          cpu: string | null
          cpu_qty: number | null
          memory_part_numbers: string | null
          memory_qty: number | null
          gpu: string | null
          specs: Record<string, unknown> | null
        }>) {
          const specs = it.specs && typeof it.specs === 'object' ? it.specs : {}
          const drives = typeof specs?.drives === 'string' ? specs.drives : null
          const drivesQty = typeof specs?.drives_qty === 'number' ? specs.drives_qty : null
          const gpuQty = typeof specs?.gpu_qty === 'number' ? specs.gpu_qty : null
          const lineQty = qtyByLine[it.id] ?? 1

          if (it.cpu) {
            await sb.rpc('log_part_observation', {
              p_part_number: it.cpu,
              p_category: 'cpu',
              p_qty: (it.cpu_qty ?? 1) * lineQty,
              p_qty_type: 'sold',
              p_lot: it.lot_id,
              p_line: it.id,
              p_offer: offerId,
              p_source: 'offer_lines',
            })
          }
          if (it.memory_part_numbers) {
            await sb.rpc('log_part_observation', {
              p_part_number: it.memory_part_numbers,
              p_category: 'memory',
              p_qty: (it.memory_qty ?? 1) * lineQty,
              p_qty_type: 'sold',
              p_lot: it.lot_id,
              p_line: it.id,
              p_offer: offerId,
              p_source: 'offer_lines',
            })
          }
          if (it.gpu) {
            await sb.rpc('log_part_observation', {
              p_part_number: it.gpu,
              p_category: 'gpu',
              p_qty: (gpuQty ?? 1) * lineQty,
              p_qty_type: 'sold',
              p_lot: it.lot_id,
              p_line: it.id,
              p_offer: offerId,
              p_source: 'offer_lines',
            })
          }
          if (drives) {
            await sb.rpc('log_part_observation', {
              p_part_number: drives,
              p_category: 'drive',
              p_qty: (drivesQty ?? 1) * lineQty,
              p_qty_type: 'sold',
              p_lot: it.lot_id,
              p_line: it.id,
              p_offer: offerId,
              p_source: 'offer_lines',
            })
          }
        }
      }
    } catch (e) {
      console.warn('part tracking skipped', e)
    }
  }

  return NextResponse.json({ ok: true, offer_id: offerId })
}
