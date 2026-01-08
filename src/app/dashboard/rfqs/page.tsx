"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type RfqListItem = {
  id: string
  subject: string | null
  note: string | null
  status: string
  buyer_tenant_id: string
  buyer_tenant_name: string | null
  requester_name: string | null
  requester_email: string | null
  requester_phone: string | null
  requester_company: string | null
  created_at: string
  line_count: number
}

export default function RfqsPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [rfqs, setRfqs] = useState<RfqListItem[]>([])
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
        await loadRfqs(tenant)
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load RFQs')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const loadRfqs = async (tenant: string) => {
    const { data, error } = await supabase
      .from('rfqs')
      .select(
        'id,subject,note,status,buyer_tenant_id,created_at,rfq_lines(count),requester_name,requester_email,requester_phone,requester_company'
      )
      .eq('supplier_tenant_id', tenant)
      .in('status', ['new', 'sent'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const buyerTenantIds = Array.from(new Set((data ?? []).map((r) => String(r.buyer_tenant_id ?? '')).filter(Boolean)))
    const tenantNames =
      buyerTenantIds.length > 0
        ? new Map(
            (
              (await supabase.from('tenants').select('id,name').in('id', buyerTenantIds)).data ?? []
            ).map((t: any) => [String(t.id), t.name as string | null])
          )
        : new Map()
    const mapped: RfqListItem[] =
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        subject: r.subject == null ? null : String(r.subject),
        note: r.note == null ? null : String(r.note),
        status: r.status == null ? 'new' : String(r.status),
        buyer_tenant_id: String(r.buyer_tenant_id ?? ''),
        buyer_tenant_name: tenantNames.get(String(r.buyer_tenant_id ?? '')) ?? null,
        requester_name: r.requester_name == null ? null : String(r.requester_name),
        requester_email: r.requester_email == null ? null : String(r.requester_email),
        requester_phone: r.requester_phone == null ? null : String(r.requester_phone),
        requester_company: r.requester_company == null ? null : String(r.requester_company),
        created_at: r.created_at ? String(r.created_at) : new Date().toISOString(),
        line_count: Array.isArray((r as any).rfq_lines) && (r as any).rfq_lines[0]
          ? Number((r as any).rfq_lines[0].count ?? 0)
          : 0,
      })) ?? []
    setRfqs(mapped)
  }

  const markRfqQuoted = async (rfqId: string) => {
    try {
      const { error } = await supabase.from('rfqs').update({ status: 'quoted' }).eq('id', rfqId)
      if (error) throw error
      if (tenantId) await loadRfqs(tenantId)
    } catch (e) {
      console.error('rfq update error', e)
      setError(e instanceof Error ? e.message : 'Failed to update RFQ')
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>RFQs awaiting response</h1>
        <p style={{ color: 'var(--muted)' }}>Respond to incoming RFQs from other organisations.</p>
        <a
          href="/dashboard/quoting"
          style={{
            display: 'inline-block',
            marginTop: 6,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          ← Back to Quotes
        </a>
      </div>

      {error ? (
        <div style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: 12, background: 'rgba(178,58,58,0.08)' }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading RFQs…</div>
      ) : rfqs.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No RFQs awaiting response.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rfqs.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{r.subject || 'RFQ'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    From: {r.requester_company || r.buyer_tenant_name || r.buyer_tenant_id.slice(0, 8)}{' '}
                    {r.requester_name ? `• ${r.requester_name}` : ''} {r.requester_email ? `• ${r.requester_email}` : ''}{' '}
                    {r.requester_phone ? `• ${r.requester_phone}` : ''} • {new Date(r.created_at).toLocaleString()} • Lines: {r.line_count}
                  </div>
                  {r.note ? <div style={{ marginTop: 6 }}>{r.note}</div> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => markRfqQuoted(r.id)}
                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                  >
                    Mark quoted
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
