'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'
import { buildLotExportRows, exportRowsToCsv } from '@/lib/exportLot'

type Lot = {
  id: string
  tenant_id: string
  title: string | null
  status: string | null
  currency: string | null
}

type LineItem = {
  id: string
  lot_id: string
  description: string | null
  qty: number | null
  asking_price: number | null
  serial_tag: string | null
  model: string | null
  cpu: string | null
  cpu_qty: number | null
  memory_part_numbers: string | null
  memory_qty: number | null
  network_card: string | null
  expansion_card: string | null
  gpu: string | null
  specs: Record<string, unknown> | null
}

export default function CreateSummaryPage() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lots, setLots] = useState<Lot[]>([])
  const [itemsByLot, setItemsByLot] = useState<Record<string, LineItem[]>>({})

  const lotIds = useMemo(() => {
    const idsParam = searchParams?.get('ids') || ''
    return idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [searchParams])
  const groupToken = useMemo(() => searchParams?.get('group') || '', [searchParams])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const profile = await ensureProfile()

        let fetchedLots: Lot[] = []
        if (lotIds.length) {
          const { data: lotRows, error: lotErr } = await supabase
            .from('lots')
            .select('id,tenant_id,title,status,currency,group_token')
            .in('id', lotIds)
            .eq('tenant_id', profile.tenant_id)
          if (lotErr) throw lotErr
          fetchedLots = (lotRows as Lot[]) ?? []
        } else if (groupToken) {
          const { data: lotRows, error: lotErr } = await supabase
            .from('lots')
            .select('id,tenant_id,title,status,currency,group_token')
            .eq('tenant_id', profile.tenant_id)
            .eq('group_token', groupToken)
          if (lotErr) throw lotErr
          fetchedLots = (lotRows as Lot[]) ?? []
        } else {
          setLoading(false)
          return
        }
        setLots(fetchedLots)
        const ids = fetchedLots.map((l) => l.id)

        const { data: itemRows, error: itemErr } = await supabase
          .from('line_items')
          .select(
            'id,lot_id,description,qty,asking_price,serial_tag,model,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu,specs'
          )
          .in('lot_id', ids)
        if (itemErr) throw itemErr
        const grouped: Record<string, LineItem[]> = {}
        for (const row of (itemRows as LineItem[]) ?? []) {
          const arr = grouped[row.lot_id] ?? []
          arr.push(row)
          grouped[row.lot_id] = arr
        }
        setItemsByLot(grouped)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load summary'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotIds, groupToken])

  const downloadLot = async (lot: Lot) => {
    const items = itemsByLot[lot.id] ?? []
    const rows = buildLotExportRows(items as Parameters<typeof buildLotExportRows>[0], lot.currency || 'USD')
    exportRowsToCsv(rows, `${(lot.title || 'lot').replace(/\s+/g, '_')}_${lot.id}.csv`)
  }

  if (!lotIds.length && !groupToken) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Lots created</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>No lot IDs provided.</div>
        <Link href="/dashboard/lots">Back to lots</Link>
      </main>
    )
  }

  if (loading) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Lots created</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Lots created</h1>
          <div style={{ color: 'var(--muted)' }}>
            Condensed view of sub-lots created from your upload. Invite buyers per sub-lot or download a ready-made CSV.
          </div>
        </div>
        <Link href="/dashboard/lots" style={{ textDecoration: 'none' }}>
          ← Back to lots
        </Link>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}

      <div style={{ display: 'grid', gap: 12 }}>
        {lots.map((lot) => {
          const items = itemsByLot[lot.id] ?? []
          return (
            <div
              key={lot.id}
              style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)', boxShadow: 'var(--shadow)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{lot.title || 'Untitled lot'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {items.length} line items • Status: {lot.status ?? 'draft'} • Currency: {lot.currency ?? 'USD'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => downloadLot(lot)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Download sub-lot
                  </button>
                  <Link
                    href={`/dashboard/lots/${lot.id}/invite`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                      color: '#fff',
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                  >
                    Invite buyers to sub-lot
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
