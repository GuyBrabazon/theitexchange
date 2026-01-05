import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type AwardLine = {
  id: string
  lot_id: string
  round_id: string | null
  buyer_id: string
  line_item_id: string
  offer_id: string | null
  currency: string | null
  unit_price: number | null
  qty: number | null
  extended: number | null
  created_at: string | null
  line_items?: {
    id: string
    line_ref?: string | null
    model?: string | null
    description?: string | null
    qty?: number | null
    asking_price?: number | null
    serial_tag?: string | null
  } | null
}

export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  // 1) Validate invite (include round_id!)
  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,status,tenant_id,lot_id,buyer_id,round_id,created_at')
    .eq('token', token)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })
  }

  // 2) Determine "effective round" for THIS invite
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

  // 3) Pull awards ONLY for THIS buyer + THIS lot + THIS effective round
  let awardsQ = sb
    .from('awarded_lines')
    .select(
      `
      id,lot_id,round_id,line_item_id,buyer_id,offer_id,currency,unit_price,qty,extended,created_at,
      line_items ( id,line_ref,model,description,qty,asking_price,serial_tag )
    `
    )
    .eq('lot_id', inv.lot_id)
    .eq('buyer_id', inv.buyer_id)
    .order('created_at', { ascending: false })

  if (effectiveRoundId) awardsQ = awardsQ.eq('round_id', effectiveRoundId)

  const { data: awards, error: aErr } = await awardsQ

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 })
  }

  // 4) Totals + winner flag (winner = has awards in effective round)
  const awardsList = (awards ?? []) as AwardLine[]
  const total = awardsList.reduce((s: number, r) => s + Number(r.extended ?? 0), 0)
  const isWinner = awardsList.length > 0

  return NextResponse.json({
    invite: {
      id: inv.id,
      token: inv.token,
      status: inv.status ?? null,
      tenant_id: inv.tenant_id,
      lot_id: inv.lot_id,
      buyer_id: inv.buyer_id,
      round_id: inv.round_id ?? null,
    },
    effective_round: { id: effectiveRoundId, round_number: effectiveRoundNumber },
    is_winner: isWinner,
    awards: awardsList,
    awards_total: total,
  })
}
