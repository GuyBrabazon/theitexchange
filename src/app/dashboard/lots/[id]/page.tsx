'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type LotRow = {
  id: string
  title: string | null
  status: string | null
  type: string | null
  currency: string | null
  created_at: string | null
  outcome: string | null
  outcome_notes: string | null
  category: string | null
}

type LineItemRow = {
  id: string
  description: string | null
  qty: number | null
  asking_price: number | null
  serial_tag: string | null
  model: string | null
}

type InviteRow = {
  id: string
  status: string | null
  created_at: string | null
  token: string | null
  buyers?: { name: string | null; company: string | null; email: string | null }
}

type OfferRow = {
  id: string
  status: string | null
  created_at: string | null
  total_offer: number | null
  buyers?: { name: string | null; company: string | null }
  invite_id: string | null
}

export default function LotDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lotId = (params?.id as string) || ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [lot, setLot] = useState<LotRow | null>(null)
  const [lines, setLines] = useState<LineItemRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [offers, setOffers] = useState<OfferRow[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: auth } = await supabase.auth.getUser()
        const user = auth.user
        if (!user) {
          router.replace('/login')
          return
        }

        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()
        if (profileErr) throw profileErr
        const tenantId = profile?.tenant_id
        if (!tenantId) throw new Error('Tenant not found')

        const { data: lotData, error: lotErr } = await supabase
          .from('lots')
          .select(
            'id,title,status,type,currency,created_at,outcome,outcome_notes,category'
          )
          .eq('tenant_id', tenantId)
          .eq('id', lotId)
          .maybeSingle()

        if (lotErr) throw lotErr
        if (!lotData) throw new Error('Lot not found')
        setLot(lotData as LotRow)

        const [linesRes, invitesRes, offersRes] = await Promise.all([
          supabase.from('line_items').select('id,description,qty,asking_price,serial_tag,model').eq('lot_id', lotId).order('created_at', { ascending: true }),
          supabase
            .from('lot_invites')
            .select('id,status,created_at,token,buyers(name,company,email)')
            .eq('lot_id', lotId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true }),
          supabase
            .from('offers')
            .select('id,status,created_at,total_offer,invite_id,buyers(name,company)')
            .eq('lot_id', lotId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false }),
        ])

        if (linesRes.error) throw linesRes.error
        if (invitesRes.error) throw invitesRes.error
        if (offersRes.error) throw offersRes.error

        setLines((linesRes.data as LineItemRow[]) || [])

        const inviteRows =
          (Array.isArray(invitesRes.data) ? invitesRes.data : []).map((row) => {
            const buyerRaw = (row as any)?.buyers
            const buyerObj = Array.isArray(buyerRaw) ? buyerRaw[0] : buyerRaw
            return {
              id: String((row as any)?.id ?? ''),
              status: (row as any)?.status ?? null,
              created_at: (row as any)?.created_at ?? null,
              token: (row as any)?.token ?? null,
              buyers: buyerObj
                ? {
                    name: buyerObj.name ?? null,
                    company: buyerObj.company ?? null,
                    email: buyerObj.email ?? null,
                  }
                : null,
            } as InviteRow
          }) ?? []
        setInvites(inviteRows)

        const offerRows =
          (Array.isArray(offersRes.data) ? offersRes.data : []).map((row) => {
            const buyerRaw = (row as any)?.buyers
            const buyerObj = Array.isArray(buyerRaw) ? buyerRaw[0] : buyerRaw
            return {
              id: String((row as any)?.id ?? ''),
              status: (row as any)?.status ?? null,
              created_at: (row as any)?.created_at ?? null,
              total_offer: (row as any)?.total_offer ?? null,
              invite_id: (row as any)?.invite_id ?? null,
              buyers: buyerObj
                ? {
                    name: buyerObj.name ?? null,
                    company: buyerObj.company ?? null,
                  }
                : null,
            } as OfferRow
          }) ?? []
        setOffers(offerRows)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load lot'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [lotId, router])

  const fmtDate = (ts: string | null | undefined) => {
    if (!ts) return 'n/a'
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toLocaleString()
  }

  if (loading) {
    return (
      <main>
        <div style={{ marginBottom: 8 }}>
          <Link href="/dashboard/lots" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
            ← Back to lots
          </Link>
        </div>
        <div>Loading lot…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <div style={{ marginBottom: 8 }}>
          <Link href="/dashboard/lots" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
            ← Back to lots
          </Link>
        </div>
        <div style={{ color: 'crimson' }}>{error}</div>
      </main>
    )
  }

  if (!lot) return null

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div style={{ marginBottom: 6 }}>
            <Link href="/dashboard/lots" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
              ← Back to lots
            </Link>
          </div>
          <h1 style={{ margin: 0 }}>{lot.title || '(Untitled lot)'}</h1>
          <div style={{ color: 'var(--muted)' }}>
            Type: <b style={{ color: 'var(--text)' }}>{lot.type || 'n/a'}</b> · Status:{' '}
            <b style={{ color: 'var(--text)' }}>{lot.status || 'n/a'}</b> · Currency:{' '}
            <b style={{ color: 'var(--text)' }}>{lot.currency || 'n/a'}</b>
          </div>
          <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: 12 }}>Created: {fmtDate(lot.created_at)}</div>
        </div>

        <Link
          href={`/dashboard/lots/${lot.id}/invite`}
          style={{
            textDecoration: 'none',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
            color: '#fff',
            fontWeight: 950,
          }}
        >
          Invite buyers
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr', alignItems: 'start' }}>
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)' as CSSProperties['borderRadius'],
            padding: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Summary</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Status</div>
              <div style={{ fontWeight: 900 }}>{lot.status || 'n/a'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Category</div>
              <div style={{ fontWeight: 900 }}>{lot.category || 'n/a'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Outcome</div>
              <div style={{ fontWeight: 900 }}>{lot.outcome || 'n/a'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Outcome notes</div>
              <div style={{ fontWeight: 900 }}>{lot.outcome_notes || 'n/a'}</div>
            </div>
          </div>
        </section>

        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)' as CSSProperties['borderRadius'],
            padding: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Line items</div>
          {lines.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No line items yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((l) => (
                <div
                  key={l.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(15,23,42,0.02)' }}
                >
                  <div style={{ fontWeight: 900 }}>{l.description || '(No description)'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                    Qty: {l.qty ?? 'n/a'} · Asking: {l.asking_price ?? 'n/a'} · Model: {l.model || 'n/a'}
                  </div>
                  {l.serial_tag ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Serial: {l.serial_tag}</div> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)' as CSSProperties['borderRadius'],
            padding: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 950 }}>Invites</div>
            <Link href={`/dashboard/lots/${lot.id}/invite`} style={{ textDecoration: 'none', fontWeight: 900 }}>
              Manage invites
            </Link>
          </div>
          {invites.length === 0 ? (
            <div style={{ color: 'var(--muted)', marginTop: 6 }}>No invites yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(15,23,42,0.02)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 900 }}>{inv.buyers?.name || '(No buyer name)'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(inv.created_at)}</div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {inv.buyers?.company || 'No company'} · {inv.buyers?.email || 'No email'} · Status: {inv.status || 'invited'}
                  </div>
                  {inv.token ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                      Invite link token: {inv.token.slice(0, 8)}…
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)' as CSSProperties['borderRadius'],
            padding: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 950 }}>Offers</div>
          </div>
          {offers.length === 0 ? (
            <div style={{ color: 'var(--muted)', marginTop: 6 }}>No offers yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {offers.map((off) => (
                <div
                  key={off.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(15,23,42,0.02)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 900 }}>{off.buyers?.name || '(No buyer name)'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(off.created_at)}</div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Total: {off.total_offer ?? 'n/a'} · Status: {off.status || 'new'} {off.invite_id ? `· Invite ${off.invite_id.slice(0, 6)}…` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
