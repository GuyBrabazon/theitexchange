'use client'

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { buildDealBody, buildDealSubject, getCurrencySymbol } from '@/lib/dealEmail'

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

type BuyerProfile = {
  id: string
  name: string | null
  company: string | null
  email: string | null
  oem_tags: string[] | null
  model_tags: string[] | null
  tags: string[] | null
}

type Recommendation = {
  buyer: BuyerProfile
  score: number
}

type DealPayload = {
  ok: boolean
  deal?: DealDetail
  lines?: DealLine[]
  threads?: DealThread[]
  offers?: EmailOffer[]
  message?: string
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
  const [statusMessage, setStatusMessage] = useState('')
  const [buyers, setBuyers] = useState<BuyerProfile[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [subjectKey, setSubjectKey] = useState<string | null>(null)
  const [personalMessage, setPersonalMessage] = useState(
    'Reply in the Offer column; prefix totals with total: and we will interpret per-unit automatically.'
  )
  const [subjectCopyMessage, setSubjectCopyMessage] = useState('')
  const [bodyCopyMessage, setBodyCopyMessage] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [expandedBuyer, setExpandedBuyer] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hydrateDealPayload = useCallback((payload: DealPayload) => {
    setDeal(payload.deal ?? null)
    setLines(payload.lines ?? [])
    setThreads(payload.threads ?? [])
    setOffers(payload.offers ?? [])
    setStatus(payload.deal?.status ?? 'draft')
    setThreadEmail(payload.deal?.buyer?.email ?? '')
    setSubjectTemplate(payload.deal?.title ? `${payload.deal.title} [DL-XXXXXX]` : '')
    setSubjectKey(payload.threads?.[0]?.subject_key ?? null)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDealPayload = useCallback(async (): Promise<DealPayload | null> => {
    if (!dealId) return null
    const response = await fetch(`/api/deals/${dealId}`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message ?? 'Failed to fetch deal')
    }
    return data
  }, [dealId, fetchDealPayload, hydrateDealPayload])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refreshDeal = useCallback(async () => {
    if (!dealId) return
    try {
      const payload = await fetchDealPayload()
      if (payload?.ok) {
        hydrateDealPayload(payload)
      }
    } catch (error) {
      console.error('refresh deal error', error)
    }
  }, [dealId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const payload = await fetchDealPayload()
        if (!active) return
        if (payload?.ok) {
          hydrateDealPayload(payload)
        } else {
          setError(payload?.message ?? 'Deal not found')
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
  }, [dealId, refreshDeal])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dealId) return
    let active = true
    const pollReplies = async () => {
      try {
        await fetch('/api/email/poll', { method: 'POST' })
        if (active) {
          await refreshDeal()
        }
      } catch (error) {
        console.error('poll error', error)
      }
    }
    pollReplies()
    return () => {
      active = false
    }
  }, [dealId])

  const totalQuantity = useMemo(() => lines.reduce((sum, line) => sum + (line.qty ?? 0), 0), [lines])
  const parsedOfferCount = offers.length
  const scoringTokens = useMemo(() => {
    const tokens: Set<string> = new Set()
    lines.forEach((line) => {
      const sourceStr = (line.model ?? line.description ?? '').toLowerCase()
      sourceStr
        .split(/[\s\-_\/]+/)
        .filter((token) => token.length >= 3)
        .forEach((token) => tokens.add(token))
    })
    return tokens
  }, [lines])

  useEffect(() => {
    fetch('/api/buyers/list')
      .then((res) => res.json())
      .then((payload) => {
        if (payload.ok) {
          setBuyers(payload.buyers ?? [])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const recs = buyers
      .map((buyer) => {
        let score = 0
        const oemTags = (buyer.oem_tags ?? []).map((tag) => tag.toLowerCase())
        const modelTags = (buyer.model_tags ?? []).map((tag) => tag.toLowerCase())
        const secondaryTags = new Set((buyer.tags ?? []).map((tag) => tag.toLowerCase()))
        lines.forEach((line) => {
          const oem = (line.oem ?? '').toLowerCase()
          if (oem && oemTags.includes(oem)) {
            score += 3
          }
          scoringTokens.forEach((token) => {
            if (modelTags.includes(token)) {
              score += 2
            }
          })
          if (line.source && secondaryTags.has(line.source.toLowerCase())) {
            score += 1
          }
        })
        return { buyer, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
    setRecommendations(recs)
  }, [buyers, lines, scoringTokens])

  const buyersOffers = useMemo(() => {
    const map = new Map<
      string,
      { buyer: string; email: string | null; total: number; status: string; lines: OfferLine[] }
    >()
    offers.forEach((offer) => {
      const buyerKey = offer.buyer_email ?? offer.buyer_name ?? `offer-${offer.id}`
      const entry = map.get(buyerKey) ?? {
        buyer: offer.buyer_name ?? 'Unknown',
        email: offer.buyer_email,
        total: 0,
        status: offer.status,
        lines: [],
      }
      const lineTotal = offer.email_offer_lines.reduce((sum, line) => (line.offer_amount ?? 0) + sum, 0)
      entry.total += lineTotal
      entry.status = offer.status
      entry.lines = [...entry.lines, ...offer.email_offer_lines]
      map.set(buyerKey, entry)
    })
    return Array.from(map.values())
  }, [offers])

  const latestStatus = offers[0]?.status ?? deal?.status ?? ''

  const computedSubjectKey = subjectKey ?? threads[0]?.subject_key ?? 'DL-XXXXXX'
  const subjectPreview = buildDealSubject(subjectTemplate || 'Deal conversation', computedSubjectKey)
  const currencySymbol = getCurrencySymbol(deal?.currency)
  const buyerNameRaw = deal?.buyer?.name ?? deal?.buyer?.company ?? ''
  const buyerFirstName = buyerNameRaw.split(' ')[0] || buyerNameRaw
  const bodyHtml = buildDealBody({
    lines,
    buyerName: buyerFirstName || undefined,
    message: personalMessage,
    currencySymbol,
  })

  const copyToClipboard = async (text: string, setter: Dispatch<SetStateAction<string>>) => {
    if (!navigator?.clipboard) {
      setter('Clipboard not available')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setter('Copied!')
      setTimeout(() => setter(''), 1500)
    } catch {
      setter('Failed to copy')
    }
  }

  const toggleBuyer = (key: string | null) => {
    setExpandedBuyer((prev) => (prev === key ? null : key))
  }

  const handleOptimize = (buyer: string) => {
    setSendStatus(`Optimize triggered for ${buyer}`)
  }

  const handleSendEmail = async () => {
    if (!dealId) return
    if (!threads.length && !threadEmail) {
      setSendStatus('Create a thread or enter a recipient first.')
      return
    }
    const targetEmail = threadEmail || threads[0]?.buyer_email
    const threadId = subjectKey ?? threads[0]?.id ?? null
    if (!targetEmail || !threadId) {
      setSendStatus('Missing recipient or thread key.')
      return
    }
    setSendLoading(true)
    setSendStatus('Sending via Outlook...')
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          threadId,
          toEmail: targetEmail,
          subject: subjectPreview,
          personalMessage,
          subjectKey: computedSubjectKey,
          buyerName: buyerNameRaw.split(' ')[0] || buyerNameRaw,
        }),
      })
      const payload = await response.json()
      if (payload.ok) {
        setSendStatus('Email queued for delivery.')
        await refreshDeal()
      } else {
        setSendStatus(payload.message ?? 'Unable to send email.')
      }
    } catch (error) {
      console.error('send error', error)
      setSendStatus('Unexpected error sending email.')
    } finally {
      setSendLoading(false)
    }
  }

  const handleStatusChange = async (value: string) => {
    if (!dealId) return
    setStatus(value)
    setStatusMessage('Saving status…')
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value }),
      })
      const payload = await res.json()
      setStatusMessage(payload.ok ? 'Status saved' : payload.message ?? 'Unable to save status')
    } catch {
      setStatusMessage('Unable to save status')
    }
  }
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
        setSubjectKey(payload.thread.subject_key)
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
          <select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="ui-select">
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value.replace(/^\w/, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
          {statusMessage ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{statusMessage}</span> : null}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>Recommended buyers</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{recommendations.length} match(es)</span>
            </div>
            {recommendations.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {recommendations.map((rec) => (
                  <div
                    key={rec.buyer.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 10,
                      background: 'var(--panel)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{rec.buyer.name ?? rec.buyer.email ?? 'Buyer'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rec.buyer.company ?? '—'}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Score {rec.score}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                No recommendations yet. Add OEM/model interests to buyers to activate scores.
              </div>
            )}
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ display: 'block' }}>Compose email</strong>
                <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--muted)' }}>
                  Subject key <span style={{ fontWeight: 700 }}>{computedSubjectKey}</span> is required for replies.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="ui-btn"
                  style={{ padding: '6px 12px' }}
                  onClick={() => copyToClipboard(subjectPreview, setSubjectCopyMessage)}
                >
                  Copy subject
                </button>
                <button
                  type="button"
                  className="ui-btn"
                  style={{ padding: '6px 12px' }}
                  onClick={() => copyToClipboard(bodyHtml, setBodyCopyMessage)}
                >
                  Copy body
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  style={{ padding: '6px 12px' }}
                  onClick={handleSendEmail}
                  disabled={sendLoading}
                >
                  {sendLoading ? 'Sending...' : 'Send via Outlook'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Buyer email</label>
              <input type="email" value={threadEmail} onChange={(e) => setThreadEmail(e.target.value)} className="ui-input" />
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
              {subjectCopyMessage ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{subjectCopyMessage}</span> : null}
            </div>
            <form onSubmit={handleCreateThread} style={{ display: 'grid', gap: 6 }}>
              <button type="submit" className="ui-btn" disabled={threadLoading}>
                {threadLoading ? 'Creating thread…' : 'Generate subject key'}
              </button>
              {threadMessage ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{threadMessage}</p>
              ) : null}
            </form>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                HTML body preview (edit the text above the table; the table itself is locked)
              </label>
              <textarea
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                className="ui-textarea"
                rows={3}
              />
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 12,
                  background: 'var(--panel)',
                  fontSize: 13,
                  overflow: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
              {bodyCopyMessage ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{bodyCopyMessage}</span> : null}
              {sendStatus ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sendStatus}</span> : null}
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
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <strong>Customers who’ve offered</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Latest reply status: {latestStatus || 'pending'}
              </span>
            </div>
            {buyersOffers.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {buyersOffers.map((entry) => {
                  const key = entry.email ?? entry.buyer
                  const isOpen = expandedBuyer === key
                  return (
                    <div
                      key={key}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 12,
                        background: 'var(--panel)',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{entry.buyer}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.email ?? 'Email pending'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                          <span>Total: {entry.total.toFixed(2)}</span>
                          <span>Status: {entry.status}</span>
                          <button
                            type="button"
                            className="ui-btn"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => toggleBuyer(key)}
                          >
                            {isOpen ? 'Hide lines' : 'Review lines'}
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn-outline"
                            style={{ padding: '4px 10px', fontSize: 11 }}
                            onClick={() => handleOptimize(entry.buyer)}
                          >
                            Optimize
                          </button>
                        </div>
                      </div>
                      {isOpen ? (
                        <div style={{ display: 'grid', gap: 4, paddingLeft: 8 }}>
                          {entry.lines.map((line, idx) => (
                            <div
                              key={`${key}-${idx}`}
                              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                            >
                              <span>{line.line_ref ?? 'Line'}</span>
                              <span>{line.offer_amount != null ? line.offer_amount.toFixed(2) : 'n/a'}</span>
                              <span>{line.offer_type ?? 'per unit'}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No customers have offered yet.</div>
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
