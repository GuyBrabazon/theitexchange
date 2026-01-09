"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type RfqLine = {
  id: string
  inventory_item_id: string | null
  qty_requested: number | null
  quoted_price: number | null
  quoted_currency: string | null
}

type Rfq = {
  id: string
  subject: string | null
  note: string | null
  status: string
  created_at: string
  supplier_tenant_id: string
  supplier_tenant_name: string | null
  supplier_name: string | null
  supplier_email: string | null
  lines: RfqLine[]
}

export default function MyRfqsPage() {
  const [tenantId, setTenantId] = useState('')
  const [rfqs, setRfqs] = useState<Rfq[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) throw new Error('Not signed in')

        const { data: profile, error: profileErr } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
        if (profileErr) throw profileErr
        const tenant = profile?.tenant_id
        if (!tenant) throw new Error('Tenant not found')
        setTenantId(tenant)

        const { data, error: rfqErr } = await supabase
          .from('rfqs')
          .select(
            'id,subject,note,status,supplier_tenant_id,supplier_name,supplier_email,created_at,rfq_lines(id,qty_requested,quoted_price,quoted_currency)'
          )
          .eq('buyer_tenant_id', tenant)
          .order('created_at', { ascending: false })
          .limit(200)
        if (rfqErr) throw rfqErr

        const supplierIds = Array.from(new Set((data ?? []).map((r: any) => String(r.supplier_tenant_id ?? '')).filter(Boolean)))
        const supplierNames =
          supplierIds.length > 0
            ? new Map(
                (
                  (await supabase.from('tenants').select('id,name').in('id', supplierIds)).data ?? []
                ).map((t: any) => [String(t.id), t.name as string | null])
              )
            : new Map()

        setRfqs(
          (data ?? []).map((r: any) => ({
            id: String(r.id ?? ''),
            subject: r.subject == null ? null : String(r.subject),
            note: r.note == null ? null : String(r.note),
            status: r.status == null ? 'new' : String(r.status),
            created_at: r.created_at ? String(r.created_at) : new Date().toISOString(),
            supplier_tenant_id: String(r.supplier_tenant_id ?? ''),
            supplier_tenant_name: r.supplier_name ?? supplierNames.get(String(r.supplier_tenant_id ?? '')) ?? null,
            supplier_name: r.supplier_name ?? supplierNames.get(String(r.supplier_tenant_id ?? '')) ?? null,
            supplier_email: r.supplier_email == null ? null : String(r.supplier_email),
            lines: Array.isArray(r.rfq_lines)
              ? r.rfq_lines.map((l: any) => ({
                  id: String(l.id ?? ''),
                  inventory_item_id: l.inventory_item_id ? String(l.inventory_item_id) : null,
                  qty_requested: l.qty_requested == null ? null : Number(l.qty_requested),
                  quoted_price: l.quoted_price == null ? null : Number(l.quoted_price),
                  quoted_currency: l.quoted_currency ?? null,
                }))
              : [],
          }))
        )
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load RFQs')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const awaiting = useMemo(() => rfqs.filter((r) => r.status === 'new' || r.status === 'sent'), [rfqs])
  const quoted = useMemo(() => rfqs.filter((r) => r.status === 'quoted'), [rfqs])

  const renderTable = (items: Rfq[], title: string) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)', display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {items.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>None.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface-2)', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{r.subject || 'RFQ'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Supplier: {r.supplier_tenant_name || 'Unknown supplier'} • Tenant ID: {r.supplier_tenant_id} • {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.note ? <div>{r.note}</div> : null}
                </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={`mailto:${encodeURIComponent(r.supplier_email ?? '')}?subject=${encodeURIComponent(`RFQ ${r.id} - ${r.subject || 'RFQ'}`)}&body=${encodeURIComponent(
                `RFQ ID: ${r.id}\nSubject: ${r.subject || 'RFQ'}\nSupplier: ${r.supplier_name || r.supplier_tenant_name || r.supplier_tenant_id}\nTenant ID: ${r.supplier_tenant_id}\n\nQuestions:\n`
              )}`}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                      textDecoration: 'none',
                      color: 'var(--text)',
                    }}
                  >
                    Email Supplier
                  </a>
                  {title === 'RFQs quoted' ? (
                    <>
                      <button style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                        Convert to PO
                      </button>
                      <button style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                        Send counter offer
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 0.6fr 0.6fr',
                    background: 'var(--surface-2)',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  <div style={{ padding: 8 }}>Line</div>
                  <div style={{ padding: 8 }}>Qty requested</div>
                  <div style={{ padding: 8 }}>Quoted price</div>
                </div>
                {r.lines.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 0.6fr 0.6fr',
                      borderTop: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ padding: 8 }}>
                      <div style={{ fontWeight: 700 }}>{l.inventory_item_id || 'Line'}</div>
                    </div>
                    <div style={{ padding: 8 }}>{l.qty_requested ?? '—'}</div>
                    <div style={{ padding: 8 }}>
                      {l.quoted_price != null ? `${l.quoted_price} ${l.quoted_currency ?? ''}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>My RFQs</h1>
        <p style={{ color: 'var(--muted)' }}>RFQs you have sent to suppliers.</p>
        <Link
          href="/dashboard/buy"
          style={{ display: 'inline-block', marginTop: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)' }}
        >
          ← Back to Buy
        </Link>
      </div>

      {error ? (
        <div style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: 12, background: 'rgba(178,58,58,0.08)' }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading RFQs…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
          {renderTable(awaiting, 'RFQs awaiting quote')}
          {renderTable(quoted, 'RFQs quoted')}
        </div>
      )}
    </main>
  )
}
