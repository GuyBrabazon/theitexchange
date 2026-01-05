'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type PartRollup = {
  id: string
  part_number: string
  category: string
  oem: string
  description: string | null
  total_available: number
  total_sold: number
  last_available: string | null
  last_sold: string | null
  last_observed: string | null
  lots_seen: number
  offers_count: number
}

const pageSize = 50

export default function PartReportsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PartRollup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const searchTerm = search.trim()
  const offset = (page - 1) * pageSize

  const hasSearch = useMemo(() => searchTerm.length > 0, [searchTerm])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        let query = supabase
          .from('part_rollup')
          .select('*', { count: 'exact' })
          .order('last_observed', { ascending: false, nullsFirst: false })
          .range(offset, offset + pageSize - 1)

        if (hasSearch) {
          const term = searchTerm.replaceAll('%', '\\%')
          query = query.or(
            [
              `part_number.ilike.%${term}%`,
              `category.ilike.%${term}%`,
              `oem.ilike.%${term}%`,
              `description.ilike.%${term}%`,
            ].join(',')
          )
        }

        const { data, error: qErr, count } = await query
        if (qErr) throw qErr
        setRows((data as PartRollup[]) ?? [])

        // Adjust page if out of range
        const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize))
        if (page > totalPages) setPage(totalPages)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load parts'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [hasSearch, offset, page, searchTerm])

  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString() : '—')

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Part history</h1>
          <div style={{ color: 'var(--muted, #6b7280)' }}>Aggregated availability and sold counts across lots/offers.</div>
        </div>
        <Link href="/dashboard/reports" style={{ alignSelf: 'center' }}>
          ← Reports
        </Link>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => {
            setPage(1)
            setSearch(e.target.value)
          }}
          placeholder="Search part number, OEM, category..."
          style={{ padding: 10, border: '1px solid var(--border, #e5e7eb)', minWidth: 320, borderRadius: 10 }}
        />
        <div style={{ color: 'var(--muted, #6b7280)' }}>Page {page}</div>
        <div style={{ marginLeft: 'auto', color: 'var(--muted, #6b7280)' }}>{loading ? 'Loading…' : ''}</div>
      </div>

      {error ? <div style={{ marginTop: 12, color: 'crimson' }}>{error}</div> : null}

      <div style={{ marginTop: 16, overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--panel, #f8fafc)' }}>
              {['Part #', 'Category', 'OEM', 'Description', 'Avail', 'Sold', 'Lots', 'Offers', 'Last seen', 'Last sold'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 700 }}>{r.part_number}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.category}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.oem}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.description ?? '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.total_available}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.total_sold}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.lots_seen}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{r.offers_count}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{fmtDate(r.last_available)}</td>
                <td style={{ padding: 10, borderBottom: '1px solid var(--border, #e5e7eb)' }}>{fmtDate(r.last_sold)}</td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
                  No parts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
        >
          Prev
        </button>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={loading}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}
        >
          Next
        </button>
      </div>
    </main>
  )
}
