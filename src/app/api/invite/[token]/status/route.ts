import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type OfferRow = {
  id: string
  status: string | null
  take_all_total: number | null
  currency: string | null
  created_at: string | null
  round_id?: string | null
}

export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  // 1) Find invite
  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,tenant_id,lot_id,buyer_id,round_id,status,created_at')
    .eq('token', token)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })
  }

  // 2) Load lot basics (for UI autofill)
  const { data: lot, error: lotErr } = await sb
    .from('lots')
    .select('id,title,currency,status')
    .eq('id', inv.lot_id)
    .single()

  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 })

  // 3) Determine "effective round" for this invite
  let effectiveRoundId: string | null = inv.round_id ?? null
  let effectiveRoundNumber: number | null = null

  if (!effectiveRoundId) {
    // Prefer LIVE round
    const { data: live, error: liveErr } = await sb
      .from('lot_rounds')
      .select('id,round_number,status')
      .eq('lot_id', inv.lot_id)
      .eq('status', 'live')
      .order('round_number', { ascending: false })
      .maybeSingle()

    if (liveErr) return NextResponse.json({ error: liveErr.message }, { status: 500 })

    if (live?.id) {
      effectiveRoundId = live.id
      effectiveRoundNumber = live.round_number ?? null
    } else {
      // Else latest round
      const { data: latest, error: latestErr } = await sb
        .from('lot_rounds')
        .select('id,round_number,status')
        .eq('lot_id', inv.lot_id)
        .order('round_number', { ascending: false })
        .limit(1)

      if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 })

      const row = latest?.[0]
      if (row?.id) {
        effectiveRoundId = row.id
        effectiveRoundNumber = row.round_number ?? null
      }
    }

    // Backfill invite.round_id for stability
    if (effectiveRoundId) {
      const { error: upInvErr } = await sb.from('lot_invites').update({ round_id: effectiveRoundId }).eq('id', inv.id)
      if (upInvErr) console.warn('Failed to backfill invite round_id:', upInvErr.message)
    }
  } else {
    // Lookup round number for display
    const { data: rr, error: rrErr } = await sb
      .from('lot_rounds')
      .select('id,round_number')
      .eq('id', effectiveRoundId)
      .maybeSingle()

    if (!rrErr && rr?.round_number != null) effectiveRoundNumber = rr.round_number
  }

  // 4) Winner status: ONLY awards in THIS effective round should unlock PO
  let roundAwardedCount = 0
  if (effectiveRoundId) {
    const { count, error } = await sb
      .from('awarded_lines')
      .select('id', { count: 'exact', head: true })
      .eq('lot_id', inv.lot_id)
      .eq('buyer_id', inv.buyer_id)
      .eq('round_id', effectiveRoundId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    roundAwardedCount = count ?? 0
  }

  const isWinner = roundAwardedCount > 0

  // 5) Awarded lines list (for buyer export/PO)
  let awardsQuery = sb
    .from('awarded_lines')
    .select(
      `
      id,lot_id,round_id,buyer_id,line_item_id,unit_price,qty,extended,currency,created_at,
      line_items ( id,model,description,qty )
    `
    )
    .eq('lot_id', inv.lot_id)
    .eq('buyer_id', inv.buyer_id)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (effectiveRoundId) awardsQuery = awardsQuery.eq('round_id', effectiveRoundId)

  const { data: awardedLines, error: awErr } = await awardsQuery
  if (awErr) return NextResponse.json({ error: awErr.message }, { status: 500 })

  // 6) IMPORTANT: Offer state for THIS lot+buyer (this is what fixes the confusing banner)
  // If your offers table has round_id, we try to scope to effectiveRoundId as well.
  // If it doesn't, we still correctly scope by lot_id + buyer_id.
  let latestOffer: OfferRow | null = null
  let hasOffer = false

  // Try with round_id first (won't break if column doesn't exist because we'll fall back)
  if (effectiveRoundId) {
    const { data: offR, error: offRErr } = await sb
      .from('offers')
      .select('id,status,take_all_total,currency,created_at,round_id')
      .eq('lot_id', inv.lot_id)
      .eq('buyer_id', inv.buyer_id)
      .eq('round_id', effectiveRoundId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!offRErr && offR?.length) {
      latestOffer = offR[0]
      hasOffer = true
    }
  }

  // Fallback (no round_id column or no round-specific offer found)
  if (!hasOffer) {
    const { data: offAny, error: offAnyErr } = await sb
      .from('offers')
      .select('id,status,take_all_total,currency,created_at')
      .eq('lot_id', inv.lot_id)
      .eq('buyer_id', inv.buyer_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!offAnyErr && offAny?.length) {
      latestOffer = offAny[0]
      hasOffer = true
    }
  }

  // 7) Accepted offer (nice to display; still scoped to THIS lot+buyer)
  const acceptedOffer = latestOffer?.status === 'accepted' ? latestOffer : null

  return NextResponse.json({
    invite: {
      id: inv.id,
      token: inv.token,
      lot_id: inv.lot_id,
      buyer_id: inv.buyer_id,
      round_id: inv.round_id,
      status: inv.status ?? null,
    },
    lot: {
      id: lot.id,
      title: lot.title ?? null,
      currency: lot.currency ?? null,
      status: lot.status ?? null,
    },
    effective_round: {
      id: effectiveRoundId,
      round_number: effectiveRoundNumber,
    },
    // keep these for UI
    awarded: {
      in_effective_round: roundAwardedCount,
    },
    awarded_lines: awardedLines ?? [],
    is_winner: isWinner,

    // NEW: offer state (this fixes the confusing message)
    has_offer: hasOffer,
    latest_offer: latestOffer,

    accepted_offer: acceptedOffer,
  })
}
