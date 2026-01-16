import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const normalizePartNumber = (value: string) => value.trim().toUpperCase()

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const raw = url.searchParams.getAll('part_numbers')
    const partNumbers = Array.from(
      new Set(
        raw
          .flatMap((entry) => entry.split(','))
          .map((value) => normalizePartNumber(value))
          .filter((value) => value.length > 0)
      )
    )

    if (!partNumbers.length) {
      return NextResponse.json({ ok: true, items: [] })
    }

    const authHeader = request.headers.get('authorization') ?? ''
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('sb-access-token')?.value
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
    const token = bearerToken || cookieToken
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    if (!profile?.tenant_id) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })

    const chunkSize = 200
    const totals: Record<string, number> = {}

    for (let i = 0; i < partNumbers.length; i += chunkSize) {
      const chunk = partNumbers.slice(i, i + chunkSize)
      const chunkSet = new Set(chunk)

      const [{ data: skuRows, error: skuErr }, { data: modelRows, error: modelErr }] = await Promise.all([
        supa.from('inventory_items').select('id,sku,model,qty_available').eq('tenant_id', profile.tenant_id).in('sku', chunk),
        supa
          .from('inventory_items')
          .select('id,sku,model,qty_available')
          .eq('tenant_id', profile.tenant_id)
          .in('model', chunk),
      ])

      if (skuErr) throw skuErr
      if (modelErr) throw modelErr

      const seen = new Set<string>()
      const rows = [...(skuRows ?? []), ...(modelRows ?? [])].filter((row) => {
        const id = typeof row.id === 'string' ? row.id : ''
        if (!id) return true
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })

      rows.forEach((row) => {
        const rec = row as Record<string, unknown>
        const qtyRaw = rec.qty_available
        const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw) || 0
        const sku = typeof rec.sku === 'string' ? normalizePartNumber(rec.sku) : ''
        const model = typeof rec.model === 'string' ? normalizePartNumber(rec.model) : ''

        if (sku && chunkSet.has(sku)) {
          totals[sku] = (totals[sku] || 0) + qty
        }
        if (model && chunkSet.has(model) && model !== sku) {
          totals[model] = (totals[model] || 0) + qty
        }
      })
    }

    const items = Object.entries(totals).map(([part_number, qty]) => ({ part_number, qty }))
    return NextResponse.json({ ok: true, items })
  } catch (e) {
    console.error('stock lookup error', e)
    const msg = e instanceof Error ? e.message : 'Failed to load stock'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
