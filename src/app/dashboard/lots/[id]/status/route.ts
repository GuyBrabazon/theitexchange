import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

function normStatus(s: unknown) {
  return String(s ?? '').trim().toLowerCase()
}

const ALLOWED = new Set(['order_processing', 'sold'])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: lotId } = await ctx.params
  const sb = supabaseServer()

  // Auth check (fixes “Not authenticated” issues)
  const { data: u, error: uErr } = await sb.auth.getUser()
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 401 })
  if (!u?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { status?: unknown } | null = null
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const next = normStatus(body?.status)
  if (!ALLOWED.has(next)) {
    return NextResponse.json({ error: 'Invalid status. Allowed: order_processing, sold' }, { status: 400 })
  }

  // Load current lot for simple safety rules
  const { data: lot, error: lotErr } = await sb.from('lots').select('id,status').eq('id', lotId).single()
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 })

  const current = normStatus(lot?.status)

  // Optional: prevent weird transitions
  if (current === 'closed') return NextResponse.json({ error: 'Lot is closed and cannot be updated.' }, { status: 400 })
  if (next === 'sold' && current === 'draft') return NextResponse.json({ error: 'Cannot mark sold from draft.' }, { status: 400 })

  const { error: upErr } = await sb.from('lots').update({ status: next }).eq('id', lotId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: next })
}
