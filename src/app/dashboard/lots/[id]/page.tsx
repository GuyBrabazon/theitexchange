'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buildBatchBody, buildBatchSubject, EmailLine, getCurrencySymbol } from '@/lib/emailBatch'

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
  line_ref: string | null
  inventory_items?: { id?: string | null; sku?: string | null; model?: string | null; description?: string | null }
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

type EmailOfferLineRow = {
  line_ref: string | null
  offer_amount: number | null
  offer_type: string | null
  qty: number | null
}

type EmailOfferRow = {
  id: string
  buyer_email: string | null
  buyer_name: string | null
  received_at: string | null
  status: string | null
  buyers?: { name: string | null; company: string | null }
  email_offer_lines?: EmailOfferLineRow[]
}

type BatchRow = {
  id: string
  lot_id: string
  batch_key: string
  subject: string | null
  currency: string | null
  status: string | null
  created_at: string | null
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
  const [tenantId, setTenantId] = useState('')
  const [emailOffers, setEmailOffers] = useState<EmailOfferRow[]>([])
  const [selectedEmailOffer, setSelectedEmailOffer] = useState<EmailOfferRow | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerNameDirty, setBuyerNameDirty] = useState(false)
  const [introText, setIntroText] = useState('')
  const [outroText, setOutroText] = useState('')
  const [batchMessage, setBatchMessage] = useState('')
  const [isCreatingBatch, setIsCreatingBatch] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  const fetchBatches = useCallback(
    async (tenant: string) => {
      try {
        const { data, error } = await supabase
          .from('lot_email_batches')
          .select('id,lot_id,batch_key,subject,currency,status,created_at')
          .eq('tenant_id', tenant)
          .eq('lot_id', lotId)
          .order('created_at', { ascending: false })
        if (error) {
          console.warn('Failed to load batches', error)
          return
        }
        const rows = (data ?? []) as BatchRow[]
        setBatches(rows)
        setSelectedBatchId((prev) => (prev && rows.some((batch) => batch.id === prev) ? prev : rows[0]?.id ?? null))
      } catch (err) {
        console.error('batch load error', err)
      }
    },
    [lotId]
  )

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
        setTenantId(tenantId)

        const [linesRes, invitesRes, offersRes, emailOffersRes] = await Promise.all([
          supabase
            .from('line_items')
            .select('id,description,qty,asking_price,serial_tag,model,line_ref,inventory_items:inventory_items(id,sku,model,description)')
            .eq('lot_id', lotId)
            .order('created_at', { ascending: true }),
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
          supabase
            .from('email_offers')
            .select(
              'id,buyer_email,buyer_name,received_at,status,buyers(name,company),email_offer_lines(line_ref,offer_amount,offer_type,qty)'
            )
            .eq('lot_id', lotId)
            .eq('tenant_id', tenantId)
            .order('received_at', { ascending: false }),
        ])

        if (linesRes.error) throw linesRes.error
        if (invitesRes.error) throw invitesRes.error
        if (offersRes.error) throw offersRes.error
        if (emailOffersRes.error) throw emailOffersRes.error

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
        const preferredEmail = inviteRows[0]?.buyers?.email ?? ''
        setRecipientEmail((prev) => prev || preferredEmail)
        setBuyerNameDirty(false)

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
        const emailRows =
          (Array.isArray(emailOffersRes.data) ? emailOffersRes.data : []).map((row) => {
            const buyersData = (row as any)?.buyers
            const buyerObj = Array.isArray(buyersData) ? buyersData[0] : buyersData
            return {
              id: String((row as any)?.id ?? ''),
              buyer_email: (row as any)?.buyer_email ?? null,
              buyer_name: (row as any)?.buyer_name ?? null,
              received_at: (row as any)?.received_at ?? null,
              status: (row as any)?.status ?? null,
              buyers: buyerObj
                ? {
                    name: buyerObj.name ?? null,
                    company: buyerObj.company ?? null,
                  }
                : undefined,
              email_offer_lines: Array.isArray((row as any)?.email_offer_lines)
                ? (row as any)?.email_offer_lines.map((line: any) => ({
                    line_ref: line?.line_ref ?? null,
                    offer_amount: typeof line?.offer_amount === 'number' ? line.offer_amount : null,
                    offer_type: line?.offer_type ?? null,
                    qty: typeof line?.qty === 'number' ? line.qty : null,
                  }))
                : [],
            }
          })
        setEmailOffers(emailRows)
        await fetchBatches(tenantId)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load lot'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [lotId, router, fetchBatches])

    const fmtDate = (ts: string | null | undefined) => {
    if (!ts) return 'n/a'
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toLocaleString()
  }

  const generateBatchKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let suffix = ''
    for (let i = 0; i < 8; i += 1) {
      suffix += chars[Math.floor(Math.random() * chars.length)]
    }
    return `LOT-${suffix}`
  }

  const formatMoney = (value: number | null) => {
    if (value == null) return 'n/a'
    try {
      const formatter = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: lot?.currency ?? 'USD',
      })
      return formatter.format(value)
    } catch {
      return value.toFixed(2)
    }
  }

  const emailLines = useMemo<EmailLine[]>(() => {
    return lines.map((line) => {
      const inventory = line.inventory_items
      return {
        lineRef: line.line_ref ?? '',
        partNumber: inventory?.sku ?? inventory?.model ?? line.model ?? '',
        description: line.description ?? inventory?.description ?? '',
        qty: typeof line.qty === 'number' ? line.qty : null,
        askingPrice: line.asking_price ?? null,
      }
    })
  }, [lines])

  const activeBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId]
  )
  const batchCurrencySymbol = getCurrencySymbol(activeBatch?.currency ?? lot?.currency)
  const emailSubject = activeBatch?.subject ?? ''
  const emailBody = activeBatch
    ? buildBatchBody({
        lines: emailLines,
        currencySymbol: batchCurrencySymbol,
        buyerName,
        customIntro: introText,
        customOutro: outroText,
      })
    : ''
  const derivedBuyerName = useMemo(() => {
    if (!recipientEmail) return ''
    const target = recipientEmail.trim().toLowerCase()
    const match = invites.find(
      (inv) => inv.buyers?.email && inv.buyers.email.toLowerCase() === target
    )
    const name = match?.buyers?.name?.trim()
    if (name) {
      const first = name.split(/\s+/)[0]
      return first.charAt(0).toUpperCase() + first.slice(1)
    }
    const localPart = recipientEmail.split('@')[0] || ''
    const fallback = localPart.split(/[._-]/)[0] || ''
    if (!fallback) return ''
    return fallback.charAt(0).toUpperCase() + fallback.slice(1)
  }, [recipientEmail, invites])
  useEffect(() => {
    if (!buyerNameDirty) {
      setBuyerName(derivedBuyerName)
    }
  }, [derivedBuyerName, buyerNameDirty])

  const handleCreateBatch = async () => {
    if (!tenantId || !lot) return
    setIsCreatingBatch(true)
    setBatchMessage('')
    const currentUser = await supabase.auth.getUser()
    const creatorId = currentUser.data?.user?.id ?? null
    try {
      let attempts = 0
      while (attempts < 3) {
        attempts += 1
        const batchKey = generateBatchKey()
        const subject = buildBatchSubject(batchKey, lot.type || lot.title || 'Lot')
        const { data, error } = await supabase
          .from('lot_email_batches')
          .insert({
            tenant_id: tenantId,
            lot_id: lot.id,
            batch_key: batchKey,
            subject,
            currency: lot.currency || 'USD',
            status: 'draft',
            created_by: creatorId,
          })
          .select('id,lot_id,batch_key,subject,currency,status,created_at')
          .single()
        if (error) {
          if ((error as { code?: string }).code === '23505' && attempts < 3) {
            continue
          }
          setBatchMessage(error.message)
          return
        }
        if (data) {
          setBatches((prev) => [data, ...prev])
          setSelectedBatchId(data.id)
          setBatchMessage('Batch created. Copy the subject/body below.')
          return
        }
      }
    } finally {
      setIsCreatingBatch(false)
    }
  }

  const handleSendEmail = async () => {
    if (!selectedBatchId || !recipientEmail) return
    setIsSendingEmail(true)
    setBatchMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const resp = await fetch('/api/email/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchId: selectedBatchId, toEmail: recipientEmail, buyerName }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(payload?.message || 'Failed to send email')
      }
      setBatchMessage('Email sent via Outlook.')
      await fetchBatches(tenantId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      setBatchMessage(msg)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleMarkSent = async () => {
    if (!selectedBatchId) return
    setBatchMessage('')
    const { error } = await supabase.from('lot_email_batches').update({ status: 'sent' }).eq('id', selectedBatchId)
    if (error) {
      setBatchMessage(error.message)
      return
    }
    setBatchMessage('Marked as sent.')
    await fetchBatches(tenantId)
  }

  const copyText = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setBatchMessage('Copied to clipboard.')
    } catch {
      setBatchMessage('Clipboard not available')
    }
  }

  if (loading) {
    return (
      <main>
        <div style={{ marginBottom: 8 }}>
          <Link href="/dashboard/lots" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
            ← Back to lots
          </Link>
        </div>
        <div>Loading lot...</div>
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
            Type: <b style={{ color: 'var(--text)' }}>{lot.type || 'n/a'}</b> - Status:{' '}
            <b style={{ color: 'var(--text)' }}>{lot.status || 'n/a'}</b> - Currency:{' '}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 950 }}>Email batch</div>
            <button
              onClick={handleCreateBatch}
              disabled={!lot || isCreatingBatch}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: isCreatingBatch ? 'var(--surface-2)' : 'var(--panel)',
                cursor: isCreatingBatch ? 'wait' : 'pointer',
                fontWeight: 900,
              }}
            >
                    {isCreatingBatch ? 'Creating...' : 'Create batch'}
            </button>
          </div>
          {activeBatch ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Subject</div>
                <div style={{ fontWeight: 900, wordBreak: 'break-word' }}>{emailSubject || 'Subject will appear after creating a batch'}</div>
                <button
                  onClick={() => copyText(emailSubject)}
                  disabled={!emailSubject}
                  style={{
                    marginTop: 6,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    cursor: emailSubject ? 'pointer' : 'not-allowed',
                  }}
                >
                  Copy subject
                </button>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Send to email</label>
                <input
                  type="email"
                  placeholder="buyer@example.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Buyer name (optional)</label>
                <input
                  value={buyerName}
                  onChange={(e) => {
                    setBuyerName(e.target.value)
                    setBuyerNameDirty(true)
                  }}
                  placeholder="Buyer Name"
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSendEmail}
                    disabled={!recipientEmail || isSendingEmail}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: isSendingEmail ? 'var(--surface-2)' : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                      color: isSendingEmail ? 'var(--muted)' : '#fff',
                      cursor: isSendingEmail ? 'wait' : recipientEmail ? 'pointer' : 'not-allowed',
                      fontWeight: 900,
                    }}
                  >
                    {isSendingEmail ? 'Sending...' : 'Send via Outlook'}
                  </button>
                  <button
                    onClick={handleMarkSent}
                    disabled={activeBatch.status === 'sent'}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: activeBatch.status === 'sent' ? 'var(--surface-2)' : 'var(--panel)',
                      cursor: activeBatch.status === 'sent' ? 'not-allowed' : 'pointer',
                      fontWeight: 900,
                    }}
                  >
                    {activeBatch.status === 'sent' ? 'Marked sent' : 'Mark as sent'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>HTML body preview</div>
                  <button
                    onClick={() => copyText(emailBody)}
                    disabled={!emailBody}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      cursor: emailBody ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Copy body
                  </button>
                </div>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 10,
                    background: 'var(--surface-2)',
                    fontSize: 13,
                    color: 'var(--text)',
                    maxHeight: 240,
                    overflow: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: emailBody }}
                />
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Custom introduction text (table is locked)
                  </label>
                  <textarea
                    value={introText}
                    onChange={(e) => setIntroText(e.target.value)}
                    placeholder="Add a short greeting or note before the table. Table rows stay locked."
                    style={{
                      width: '100%',
                      minHeight: 80,
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      padding: 10,
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Custom closing text (optional)
                  </label>
                  <textarea
                    value={outroText}
                    onChange={(e) => setOutroText(e.target.value)}
                    placeholder="Add a quick closing note below the instructions."
                    style={{
                      width: '100%',
                      minHeight: 80,
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      padding: 10,
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Available batches</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batches.map((batch) => (
                    <button
                      key={batch.id}
                      onClick={() => setSelectedBatchId(batch.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: batch.id === activeBatch?.id ? 'var(--surface)' : 'var(--panel)',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {batch.batch_key}
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>{batch.status || 'draft'}</span>
                    </button>
                  ))}
                  {batches.length === 0 ? <div style={{ color: 'var(--muted)' }}>No batches yet.</div> : null}
                </div>
              </div>
              {batchMessage ? <div style={{ color: 'var(--accent)', fontSize: 12 }}>{batchMessage}</div> : null}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', marginTop: 10 }}>Create a batch to preview the email content.</div>
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
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Line items</div>
          {lines.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No line items yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((l) => {
                const inventory = l.inventory_items
                const displayDescription = l.description || inventory?.description
                const displayModel = inventory?.sku ?? inventory?.model ?? l.model
                return (
                  <div
                    key={l.id}
                    style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(15,23,42,0.02)' }}
                  >
                    <div style={{ fontWeight: 900 }}>{displayDescription || '(No description)'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                      Qty: {l.qty ?? 'n/a'} - Asking: {l.asking_price ?? 'n/a'} - Model: {displayModel || 'n/a'}
                    </div>
                    {l.serial_tag ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Serial: {l.serial_tag}</div> : null}
                  </div>
                )
              })}
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
                    {inv.buyers?.company || 'No company'} - {inv.buyers?.email || 'No email'} - Status: {inv.status || 'invited'}
                  </div>
                  {inv.token ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                      Invite link token: {inv.token.slice(0, 8)}...
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
                    Total: {off.total_offer ?? 'n/a'} - Status: {off.status || 'new'} {off.invite_id ? `- Invite ${off.invite_id.slice(0, 6)}...` : ''}
                  </div>
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
            <div style={{ fontWeight: 950 }}>Customers who’ve offered</div>
            <Link href={`/dashboard/lots/${lot.id}/optimize`} style={{ textDecoration: 'none', fontWeight: 900 }}>
              Jump to optimizer
            </Link>
          </div>
          {emailOffers.length === 0 ? (
            <div style={{ color: 'var(--muted)', marginTop: 8 }}>No email-based offers have been parsed yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                <div>Name</div>
                <div>Company</div>
                <div>Lines with offers</div>
                <div />
              </div>
              {emailOffers.map((offer) => {
                const name = offer.buyers?.name ?? offer.buyer_name ?? offer.buyer_email ?? 'Unknown'
                const company = offer.buyers?.company ?? '—'
                const lineSummary = (offer.email_offer_lines ?? [])
                  .map((line) => `${line.line_ref || 'Line'}: ${formatMoney(line.offer_amount ?? null)}`)
                  .join(' • ')
                const receivedAt = offer.received_at ? fmtDate(offer.received_at) : null
                return (
                  <div
                    key={offer.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      background: 'rgba(15,23,42,0.02)',
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{offer.buyer_email || ''}</div>
                    </div>
                    <div>{company}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{lineSummary || 'No line offers yet'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        onClick={() => {
                          setSelectedEmailOffer(offer)
                          setShowOfferModal(true)
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--panel)',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        View lines
                      </button>
                      {receivedAt ? (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{receivedAt}</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
      {showOfferModal && selectedEmailOffer ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 45px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 900 }}>Offer lines</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {selectedEmailOffer.buyers?.name || selectedEmailOffer.buyer_name || selectedEmailOffer.buyer_email}
                </div>
              </div>
              <button
                onClick={() => setShowOfferModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
              Status: {selectedEmailOffer.status || 'parsed'}
              {selectedEmailOffer.received_at ? ` • Received ${fmtDate(selectedEmailOffer.received_at)}` : ''}
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', paddingBottom: 6 }}>Line</th>
                    <th style={{ borderBottom: '1px solid var(--border)', textAlign: 'right', paddingBottom: 6 }}>Qty</th>
                    <th style={{ borderBottom: '1px solid var(--border)', textAlign: 'right', paddingBottom: 6 }}>Offer</th>
                    <th style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', paddingBottom: 6 }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedEmailOffer.email_offer_lines ?? []).map((line) => (
                    <tr key={`${selectedEmailOffer.id}-${line.line_ref}-${line.offer_type}`}>
                      <td style={{ padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>{line.line_ref || 'Line'}</td>
                      <td style={{ padding: '6px 4px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                        {line.qty ?? '—'}
                      </td>
                      <td style={{ padding: '6px 4px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                        {formatMoney(line.offer_amount ?? null)}
                      </td>
                      <td style={{ padding: '6px 4px', borderBottom: '1px solid var(--border)' }}>{line.offer_type || 'per_unit'}</td>
                    </tr>
                  ))}
                  {(selectedEmailOffer.email_offer_lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 6, textAlign: 'center', color: 'var(--muted)' }}>
                        No lines parsed yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Link
                href={`/dashboard/lots/${lot.id}/optimize`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  textDecoration: 'none',
                  fontWeight: 700,
                }}
              >
                Open optimizer
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
