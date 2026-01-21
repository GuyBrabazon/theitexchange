'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type DealDetail = {
  id: string
  title: string | null
  status: string | null
  currency: string | null
  source: string | null
  last_activity_at: string | null
  expected_close_date: string | null
  stage_notes: string | null
  buyer: {
    id: string
    name: string | null
    company: string | null
    email: string | null
  } | null
}

type DealLine = {
  id: string
  line_ref: string
  source: string
  qty: number | null
  ask_price: number | null
  currency: string | null
  status: string
  model: string | null
  description: string | null
  oem: string | null
  inventory_item_id: string | null
}

type DealThread = {
  id: string
  buyer_email: string
  subject_key: string
  subject_template: string
  status: string
  created_at: string | null
}

type OfferLine = {
  line_ref: string | null
  offer_amount: number | null
  offer_type: string | null
  qty: number | null
}

type EmailOffer = {
  id: string
  buyer_email: string
  buyer_name: string | null
  received_at: string | null
  status: string
  deal_thread_id: string | null
  email_offer_lines: OfferLine[]
}

const statusOptions = [
  'draft',
  'outreach',
  'negotiating',
  'agreed',
  'ordered',
  'fulfilled',
  'closed',
  'lost',
]

function formatDate(value?: string | null) {
  if (!value) return 'n/a'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function DealDetailPage() {
  const params = useParams()
  const dealId = params?.id
  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [lines, setLines] = useState<DealLine[]>([])
  const [threads, setThreads] = useState<DealThread[]>([])
  const [offers, setOffers] = useState<EmailOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('draft')
  const [threadEmail, setThreadEmail] = useState('')
  const [subjectTemplate, setSubjectTemplate] = useState('')
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadMessage, setThreadMessage] = useState('')

  useEffect(() => {
    if (!dealId) {
      setDeal(null)
      setLines([])
      setThreads([])
      setOffers([])
      setLoading(false)
      return
    }

    let active = true
    const loadDeal = async () => {
      if (!active) return
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/deals/${dealId}`)
        const payload = await res.json()
        if (!active) return
        if (payload.ok) {
          setDeal(payload.deal)
          setLines(payload.lines ?? [])
          setThreads(payload.threads ?? [])
          setOffers(payload.offers ?? [])
          setStatus(payload.deal?.status ?? 'draft')
          setThreadEmail(payload.deal?.buyer?.email ?? '')
          setSubjectTemplate(payload.deal?.title ? `${payload.deal.title} [DL-XXXXXX]` : '')
        } else {
          setError(payload.message ?? 'Deal not found')
          setDeal(null)
        }
      } catch {
        if (active) {
          setError('Unable to load deal')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    loadDeal()
    return () => {
      active = false
    }
  }, [dealId])

  const totalQuantity = useMemo(() => lines.reduce((sum, line) => sum + (line.qty ?? 0), 0), [lines])
  const parsedOfferCount = offers.length

  const handleCreateThread = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dealId) return
    setThreadLoading(true)
    setThreadMessage('')
    try {
      const res = await fetch(`/api/deals/${dealId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_email: threadEmail,
          subject_template: subjectTemplate || 'Deal conversation',
        }),
      })
      const payload = await res.json()
      if (payload.ok) {
        setThreads((prev) => [payload.thread, ...prev])
        setThreadMessage('Thread created — copy subject with key.')
      } else {
        setThreadMessage(payload.message ?? 'Unable to create thread.')
      }
    } catch {
      setThreadMessage('Unexpected error creating thread.')
    } finally {
      setThreadLoading(false)
    }
  }

  if (!dealId) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted)' }}>Select a deal from the list.</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{deal?.title ?? 'Deal detail'}</h1>
          <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
            {deal?.buyer ? `${deal.buyer.name ?? 'Buyer'} · ${deal.buyer.company ?? 'Company'}` : 'Buyer not set'}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="ui-select">
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value.replace(/^\w/, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 12 }}>
          Loading deal details…
        </div>
      ) : error ? (
        <div style={{ padding: 16, color: 'var(--bad)', border: '1px solid var(--border)', borderRadius: 12 }}>
          {error}
        </div>
      ) : !deal ? (
        <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
          Deal not found.
        </div>
      ) : (
        <>
          <section style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Equipment</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{lines.length} line(s)</div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                Last activity {formatDate(deal.last_activity_at)}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  overflow: 'auto',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 720,
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ textAlign: 'left', padding: 8 }}>Line ref</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Description</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Source</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Ask price</th>
                      <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td style={{ padding: 8 }}>{line.line_ref}</td>
                        <td style={{ padding: 8, maxWidth: 220, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          {line.model ?? line.description ?? 'Item'}
                        </td>
                        <td style={{ padding: 8 }}>{line.source}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{line.qty ?? '-'}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {line.ask_price != null ? `${line.ask_price.toFixed(2)} ${line.currency ?? deal.currency ?? 'USD'}` : '—'}
                        </td>
                        <td style={{ padding: 8 }}>{line.status}</td>
                      </tr>
                    ))}
                    {!lines.length ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)' }}>
                          No equipment lines yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
              {totalQuantity} unit{totalQuantity === 1 ? '' : 's'} tracked · Source: {deal.source ?? 'mixed'}
            </div>
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block' }}>Compose email</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Subject needs [DL-XXXXXX] key to link replies automatically.
                </span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{deal.currency ?? 'USD'}</span>
            </div>
            <form onSubmit={handleCreateThread} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Buyer email</label>
                <input
                  type="email"
                  value={threadEmail}
                  onChange={(e) => setThreadEmail(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Subject template</label>
                <input
                  type="text"
                  value={subjectTemplate}
                  onChange={(e) => setSubjectTemplate(e.target.value)}
                  placeholder="Your subject here"
                  className="ui-input"
                />
              </div>
              <button type="submit" className="ui-btn" disabled={threadLoading}>
                {threadLoading ? 'Creating thread…' : 'Generate subject key'}
              </button>
              {threadMessage ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{threadMessage}</p>
              ) : null}
            </form>
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>Email threads</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{threads.length} thread(s)</span>
            </div>
            {threads.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 10,
                      background: 'var(--panel)',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{thread.subject_template}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12 }}>
                      <span>{thread.subject_key}</span>
                      <span style={{ color: 'var(--muted)' }}>{thread.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Created {formatDate(thread.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No threads yet.</div>
            )}
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <strong>Parsed offers</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{parsedOfferCount} replies</span>
            </div>
            {offers.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 10,
                      background: 'var(--panel)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{offer.buyer_name ?? offer.buyer_email}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Received {formatDate(offer.received_at)} · Status: {offer.status}
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {offer.email_offer_lines.map((line, idx) => (
                        <div
                          key={`${offer.id}-${idx}`}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                        >
                          <span>{line.line_ref ?? 'Line'}</span>
                          <span>{line.offer_amount != null ? `${line.offer_amount.toFixed(2)}` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No parsed offers yet.</div>
            )}
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 8,
            }}
          >
            <strong>Summary</strong>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Internal notes: {deal.stage_notes ?? 'None'}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              Expected close:{' '}
              {deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : 'Not set'}
            </p>
          </section>
        </>
      )}
    </main>
  )
}
