'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

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
  model: string | null
  description: string | null
}

type Buyer = {
  id: string
  tenant_id: string
  name: string
  email: string | null
  company: string | null
  tags: string[] | null

  credit_ok: boolean | null
  reliability_score: number | null
  payment_terms: string | null

  // performance metrics
  lots_won_count: number | null
  awarded_lines_count: number | null
  pos_received_count: number | null
  po_lots_count: number | null
  award_conversion_rate: number | null
  avg_hours_to_po: number | null
  last_win_at: string | null
  last_po_at: string | null

  created_at: string
}

type LotInvite = {
  id: string
  lot_id: string
  buyer_id: string
  token: string
  status: string | null
  round_id: string | null
}

type LotRound = {
  id: string
  lot_id: string
  tenant_id: string
  round_number: number
  scope: 'all' | 'unsold' | 'custom'
  status: 'draft' | 'live' | 'closed'
  notes: string | null
  created_at: string
  closed_at: string | null
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

function daysAgo(ts: string | null | undefined) {
  if (!ts) return 9999
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return 9999
  const diff = Date.now() - t
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function buildBaseUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function buyerTagStrings(b: Buyer): string[] {
  return (b.tags ?? []).map((t) => norm(String(t)))
}

function keywordTokensFromLot(lot: Lot | null, items: LineItem[]) {
  const base: string[] = []
  if (lot?.title) base.push(lot.title)

  // add some model/description hints (first ~80)
  const sample = items.slice(0, 80)
  for (const it of sample) {
    if (it.model) base.push(it.model)
    else if (it.description) base.push(it.description)
  }

  const joined = base.join(' ')
  const tokens = joined
    .split(/[\s,;/|]+/g)
    .map((t) => norm(t))
    .filter(Boolean)
    .filter((t) => t.length >= 3)

  const mapped: string[] = []
  for (const t of tokens) {
    mapped.push(t)
    if (t === 'hewlett-packard') mapped.push('hp')
    if (t === 'hpe') mapped.push('hp')
    if (t === 'dell' || t.startsWith('dell')) mapped.push('dell')
    if (t === 'cisco' || t.startsWith('cisco')) mapped.push('cisco')
    if (t === 'lenovo' || t.startsWith('lenovo')) mapped.push('lenovo')
    if (t === 'supermicro' || t.startsWith('supermicro')) mapped.push('supermicro')
  }

  return uniq([...tokens, ...mapped])
}

function tagMatchCount(buyerTags: string[], lotTokens: string[]) {
  if (!buyerTags.length || !lotTokens.length) return 0
  const set = new Set(buyerTags)
  let c = 0
  for (const t of lotTokens) {
    if (set.has(t)) c++
  }
  return c
}

function convText(b: Buyer) {
  const wins = Number(b.lots_won_count ?? 0)
  const poLots = Number(b.po_lots_count ?? 0)
  if (!wins) return '—'
  const pct = Math.round((poLots / wins) * 100)
  return `${pct}% (${poLots}/${wins})`
}

function buyerScore(b: Buyer, lotTokens: string[]) {
  const tags = buyerTagStrings(b)
  const match = tagMatchCount(tags, lotTokens)

  const credit = b.credit_ok ? 1 : 0
  const rel = Number(b.reliability_score ?? 0)
  const wins = Number(b.lots_won_count ?? 0)
  const poUploads = Number(b.pos_received_count ?? 0)
  const poLots = Number(b.po_lots_count ?? 0)

  const avgH = b.avg_hours_to_po === null || b.avg_hours_to_po === undefined ? null : Number(b.avg_hours_to_po)
  const recPO = daysAgo(b.last_po_at)
  const recWin = daysAgo(b.last_win_at)

  const conv =
    b.award_conversion_rate === null || b.award_conversion_rate === undefined
      ? (wins > 0 ? poLots / wins : null)
      : Number(b.award_conversion_rate)

  const tagScore = match * 100
  const creditScore = credit ? 50 : -30
  const reliabilityScore = clamp(rel, 0, 5) * 8

  const winsScore = clamp(wins, 0, 200) * 2
  const poScore = clamp(poLots, 0, 200) * 4 + clamp(poUploads, 0, 200) * 1
  const timeScore = avgH === null ? 0 : clamp(50 - avgH, 0, 50)
  const recencyScore = clamp(30 - Math.min(recPO, recWin), 0, 30)

  let convScore = 0
  if (conv !== null && Number.isFinite(conv)) {
    const c = clamp(conv, 0, 1)
    convScore = wins >= 3 ? c * 220 : c * 90
    if (wins >= 5 && c < 0.4) convScore -= 60
    if (wins >= 5 && c < 0.2) convScore -= 80
  }

  return {
    score: tagScore + creditScore + reliabilityScore + winsScore + poScore + timeScore + recencyScore + convScore,
    matchCount: match,
  }
}

function scopeLabel(s: LotRound['scope']) {
  if (s === 'unsold') return 'Leftovers only'
  if (s === 'custom') return 'Custom selection'
  return 'All items'
}

/**
 * Ensure there is exactly one current LIVE round.
 * - If a live round exists => return it.
 * - Else create next round number (max+1).
 * - If race condition => re-select.
 */
async function ensureCurrentRoundId(lotId: string, tenantId: string) {
  const { data: live, error: liveErr } = await supabase
    .from('lot_rounds')
    .select('id,round_number,status,scope')
    .eq('lot_id', lotId)
    .eq('status', 'live')
    .order('round_number', { ascending: false })
    .limit(1)

  if (liveErr) throw liveErr
  if (live && Array.isArray(live) && live[0]?.id) return live[0].id as string

  const { data: maxRows, error: maxErr } = await supabase
    .from('lot_rounds')
    .select('round_number')
    .eq('lot_id', lotId)
    .order('round_number', { ascending: false })
    .limit(1)

  if (maxErr) throw maxErr

  const maxRound = (maxRows?.[0]?.round_number ?? 0) as number
  const nextRoundNumber = maxRound + 1

  const { data: created, error: insErr } = await supabase
    .from('lot_rounds')
    .insert({
      tenant_id: tenantId,
      lot_id: lotId,
      round_number: nextRoundNumber,
      scope: nextRoundNumber === 1 ? 'all' : 'unsold',
      status: 'live',
      notes: nextRoundNumber === 1 ? null : 'Leftovers round',
    })
    .select('id')
    .single()

  if (!insErr && created?.id) return created.id

  const msg = String(insErr?.message ?? '')
  if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
    const { data: existing, error: exErr } = await supabase
      .from('lot_rounds')
      .select('id')
      .eq('lot_id', lotId)
      .eq('round_number', nextRoundNumber)
      .limit(1)

    if (exErr) throw exErr
    const existingRow = Array.isArray(existing) ? existing[0] : existing
    if (existingRow?.id) return existingRow.id
  }

  throw insErr
}

export default function LotInvitePage() {
  const params = useParams()
  const lotId = params.id as string

  const [tenantId, setTenantId] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)
  const [items, setItems] = useState<LineItem[]>([])

  const [rounds, setRounds] = useState<LotRound[]>([])
  const [roundId, setRoundId] = useState<string>('') // selected round
  const selectedRound = useMemo(() => rounds.find((r) => r.id === roundId) ?? null, [rounds, roundId])

  const [allBuyers, setAllBuyers] = useState<Buyer[]>([])
  const [browseBuyers, setBrowseBuyers] = useState<Buyer[]>([])
  const [browseTotal, setBrowseTotal] = useState(0)
  const [browsePage, setBrowsePage] = useState(1)
  const pageSize = 30
  const [browseQ, setBrowseQ] = useState('')
  const browsePages = Math.max(1, Math.ceil((browseTotal || 0) / pageSize))

  const [invites, setInvites] = useState<LotInvite[]>([])
  const inviteByBuyerId = useMemo(() => new Map(invites.map((i) => [i.buyer_id, i])), [invites])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [savingBuyerId, setSavingBuyerId] = useState<string | null>(null)
  const [savingRound, setSavingRound] = useState(false)

  const lotTokens = useMemo(() => keywordTokensFromLot(lot, items), [lot, items])

  const loadLot = useCallback(async () => {
    const { data, error } = await supabase
      .from('lots')
      .select('id,tenant_id,title,status,currency')
      .eq('id', lotId)
      .single()
    if (error) throw error
    setLot(data as Lot)
  }, [lotId])

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('line_items')
      .select('id,lot_id,model,description')
      .eq('lot_id', lotId)
      .order('id', { ascending: false })
      .limit(800)
    if (error) throw error
    setItems((data as LineItem[]) ?? [])
  }, [lotId])

  const loadRounds = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('lot_rounds')
      .select('id,lot_id,tenant_id,round_number,scope,status,notes,created_at,closed_at')
      .eq('tenant_id', tid)
      .eq('lot_id', lotId)
      .order('round_number', { ascending: true })

    if (error) throw error
    const rows = (data as LotRound[]) ?? []
    setRounds(rows)
    return rows
  }, [lotId])

  const loadInvites = useCallback(async (rid: string) => {
    if (!rid) {
      setInvites([])
      setSelectedIds(new Set())
      return
    }

    const { data, error } = await supabase
      .from('lot_invites')
      .select('id,lot_id,buyer_id,token,status,round_id')
      .eq('lot_id', lotId)
      .eq('round_id', rid)

    if (error) throw error
    const rows = (data as LotInvite[]) ?? []
    setInvites(rows)
    setSelectedIds(new Set(rows.map((r) => r.buyer_id)))
  }, [lotId])

  const loadAllBuyers = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('buyers')
      .select(
        'id,tenant_id,name,email,company,tags,credit_ok,reliability_score,payment_terms,created_at,lots_won_count,awarded_lines_count,pos_received_count,po_lots_count,award_conversion_rate,avg_hours_to_po,last_win_at,last_po_at'
      )
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) throw error
    setAllBuyers((data as Buyer[]) ?? [])
  }, [])

  const loadBrowseBuyers = useCallback(async (tid: string, nextPage: number, query: string) => {
    const from = (nextPage - 1) * pageSize
    const to = from + pageSize - 1

    let qb = supabase
      .from('buyers')
      .select(
        'id,tenant_id,name,email,company,tags,credit_ok,reliability_score,payment_terms,created_at,lots_won_count,awarded_lines_count,pos_received_count,po_lots_count,award_conversion_rate,avg_hours_to_po,last_win_at,last_po_at',
        { count: 'exact' }
      )
      .eq('tenant_id', tid)

    const s = query.trim()
    if (s) {
      const term = s.replaceAll('%', '\\%').replaceAll(',', '\\,')
      qb = qb.or([`name.ilike.%${term}%`, `company.ilike.%${term}%`, `email.ilike.%${term}%`].join(','))
    }

    qb = qb.order('created_at', { ascending: false })

    const { data, error, count } = await qb.range(from, to)
    if (error) throw error

    setBrowseBuyers((data as Buyer[]) ?? [])
    setBrowseTotal(count ?? 0)
    setBrowsePage(nextPage)
  }, [pageSize])

  // --- init ---
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError('')

        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)

        await Promise.all([loadLot(), loadItems()])
        await loadAllBuyers(profile.tenant_id)

        // Ensure there is a current live round (race-safe)
        const currentRid = await ensureCurrentRoundId(lotId, profile.tenant_id)

        // Load rounds list and set selection
        const rs = await loadRounds(profile.tenant_id)
        if (rs.length) {
          // prefer the ensured round if present; else choose live; else newest
          const ensured = rs.find((r) => r.id === currentRid)
          const live = rs.find((r) => r.status === 'live')
          const newest = rs[rs.length - 1]
          const nextRid = ensured?.id ?? live?.id ?? newest?.id ?? ''
          setRoundId(nextRid)
          if (nextRid) await loadInvites(nextRid)
        } else {
          // Should not happen because ensureCurrentRoundId creates at least one,
          // but keep safe fallback.
          setRoundId(currentRid)
          await loadInvites(currentRid)
        }

        await loadBrowseBuyers(profile.tenant_id, 1, '')
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load invite buyers'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [loadAllBuyers, loadBrowseBuyers, loadInvites, loadItems, loadLot, loadRounds, lotId])

  // When selected round changes, reload invites for that round
  useEffect(() => {
    if (!roundId) return
    loadInvites(roundId).catch((e) => {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load invites'
      setError(msg)
    })
  }, [loadInvites, roundId])

  // debounce browse search
  useEffect(() => {
    if (!tenantId) return
    const t = setTimeout(() => {
      loadBrowseBuyers(tenantId, 1, browseQ).catch((e) => {
        console.error(e)
        setError(e?.message ?? 'Failed to load buyers')
      })
    }, 250)
    return () => clearTimeout(t)
  }, [browseQ, loadBrowseBuyers, tenantId])

  const { top10, allMatched } = useMemo(() => {
    if (!allBuyers.length) return { top10: [] as Buyer[], allMatched: [] as Buyer[] }

    const matched = allBuyers
      .map((b) => {
        const { score, matchCount } = buyerScore(b, lotTokens)
        return { b, score, matchCount }
      })
      .filter((x) => x.matchCount > 0)

    matched.sort((a, b) => b.score - a.score)

    const top = matched.slice(0, 10).map((x) => x.b)
    const all = matched.map((x) => x.b)

    return { top10: top, allMatched: all }
  }, [allBuyers, lotTokens])

  const startNewRound = async () => {
    if (!tenantId) return
    if (savingRound) return
    setSavingRound(true)
    try {
      const existing = rounds.length ? rounds : await loadRounds(tenantId)
      const max = existing.reduce((m, r) => Math.max(m, Number(r.round_number ?? 0)), 0)
      const nextNum = max + 1
      const defaultScope: LotRound['scope'] = nextNum === 1 ? 'all' : 'unsold'

      const { data, error } = await supabase
        .from('lot_rounds')
        .insert({
          tenant_id: tenantId,
          lot_id: lotId,
          round_number: nextNum,
          scope: defaultScope,
          status: 'live',
          notes: nextNum === 1 ? null : 'Leftovers round',
        })
        .select('id,lot_id,tenant_id,round_number,scope,status,notes,created_at,closed_at')
        .single()

      if (error) throw error

      const created = data as LotRound
      const nextRounds = [...existing, created].sort((a, b) => a.round_number - b.round_number)
      setRounds(nextRounds)
      setRoundId(created.id)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to start new round'
      alert(msg)
    } finally {
      setSavingRound(false)
    }
  }

  const updateRound = async (patch: Partial<Pick<LotRound, 'scope' | 'status' | 'notes' | 'closed_at'>>) => {
    if (!roundId) return
    setSavingRound(true)
    try {
    const payload: Record<string, string | number | null | boolean> = { ...patch }
      if (patch.status === 'closed') payload.closed_at = new Date().toISOString()
      if (patch.status && patch.status !== 'closed') payload.closed_at = null

      const { data, error } = await supabase
        .from('lot_rounds')
        .update(payload)
        .eq('id', roundId)
        .select('id,lot_id,tenant_id,round_number,scope,status,notes,created_at,closed_at')
        .single()

      if (error) throw error

      const updated = data as LotRound
      setRounds((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to update round'
      alert(msg)
    } finally {
      setSavingRound(false)
    }
  }

  const addBuyer = async (buyer: Buyer) => {
    if (!roundId) {
      alert('Select a round first.')
      return
    }
    if (savingBuyerId) return
    setSavingBuyerId(buyer.id)
    try {
      const existing = inviteByBuyerId.get(buyer.id)
      if (existing) {
        setSelectedIds((prev) => new Set(prev).add(buyer.id))
        return
      }

      const { error } = await supabase
        .from('lot_invites')
        .insert({
          lot_id: lotId,
          buyer_id: buyer.id,
          tenant_id: tenantId,
          round_id: roundId,
          status: 'pending',
        })

      if (error) throw error

      // Ensure lot status is open once invites are sent
      if (lot?.status && lot.status !== 'open') {
        const { error: statusErr } = await supabase.from('lots').update({ status: 'open' }).eq('id', lotId)
        if (statusErr) {
          console.warn('Failed to set lot status open', statusErr)
        } else {
          setLot((prev) => (prev ? { ...prev, status: 'open' } : prev))
        }
      }

      await loadInvites(roundId)
    } catch (e: unknown) {
      // Surface Supabase error details clearly
      const errObj = e as { message?: unknown; details?: unknown; hint?: unknown }
      console.error('Failed to add buyer', errObj?.message ?? e, errObj?.details ?? '', errObj?.hint ?? '')
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message?: unknown }).message)
            : JSON.stringify(e)
      alert(msg || 'Failed to add buyer to invites')
    } finally {
      setSavingBuyerId(null)
    }
  }

  const removeBuyer = async (buyer: Buyer) => {
    if (!roundId) return
    if (savingBuyerId) return
    setSavingBuyerId(buyer.id)
    try {
      const existing = inviteByBuyerId.get(buyer.id)
      if (!existing) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(buyer.id)
          return next
        })
        return
      }

      const { error } = await supabase.from('lot_invites').delete().eq('id', existing.id)
      if (error) throw error

      await loadInvites(roundId)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to remove buyer'
      alert(msg)
    } finally {
      setSavingBuyerId(null)
    }
  }

  const selectedBuyers = useMemo(() => {
    const set = selectedIds
    return allBuyers.filter((b) => set.has(b.id))
  }, [allBuyers, selectedIds])

  const copyAll = async () => {
    const base = buildBaseUrl()
    const lines: string[] = []

    for (const b of selectedBuyers) {
      const inv = inviteByBuyerId.get(b.id)
      const url = inv?.token ? `${base}/invite/${inv.token}` : '(missing invite)'
      lines.push([b.name, b.email ?? '', url].join('\t'))
    }

    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied (Name, Email, Link) to clipboard.')
    } catch {
      alert('Copy failed (browser permissions).')
    }
  }

  const BuyerCard = ({ b }: { b: Buyer }) => {
    const selected = selectedIds.has(b.id)
    const inv = inviteByBuyerId.get(b.id)
    const { score, matchCount } = buyerScore(b, lotTokens)

    const wins = Number(b.lots_won_count ?? 0)
    const poLots = Number(b.po_lots_count ?? 0)

    return (
      <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              {b.name}{' '}
              {b.company ? <span style={{ color: '#666', fontWeight: 700 }}>• {b.company}</span> : null}
            </div>
            <div style={{ color: '#666', marginTop: 2, fontSize: 12 }}>{b.email ?? '(no email)'}</div>

            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
              <span>Tag matches: <b>{matchCount}</b></span>
              <span>Credit: <b>{b.credit_ok ? 'OK' : 'Flag'}</b></span>
              <span>Reliability: <b>{b.reliability_score ?? '—'}</b></span>
              <span>Wins: <b>{wins}</b></span>
              <span>PO lots: <b>{poLots}</b></span>
              <span>Conversion: <b>{convText(b)}</b></span>
              <span>Avg PO time: <b>{b.avg_hours_to_po == null ? '—' : `${Math.round(Number(b.avg_hours_to_po) * 10) / 10}h`}</b></span>
              <span style={{ opacity: 0.75 }}>Score: <b>{Math.round(score)}</b></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {selected ? (
              <button
                onClick={() => removeBuyer(b)}
                disabled={savingBuyerId === b.id}
                style={{ padding: '10px 12px', borderRadius: 10 }}
              >
                {savingBuyerId === b.id ? 'Working…' : 'Remove'}
              </button>
            ) : (
              <button
                onClick={() => addBuyer(b)}
                disabled={savingBuyerId === b.id}
                style={{ padding: '10px 12px', borderRadius: 10 }}
              >
                {savingBuyerId === b.id ? 'Working…' : 'Add'}
              </button>
            )}

            {inv?.token ? (
              <a
                href={`/invite/${inv.token}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                title="Open invite link"
              >
                Open link
              </a>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Tags</div>
          <div style={{ color: '#444', marginTop: 4, fontSize: 12 }}>
            {(b.tags ?? []).length ? (b.tags ?? []).join(', ') : '—'}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>
  if (error) return <main style={{ padding: 24, color: 'crimson' }}>{error}</main>

  const showRightPanel = selectedBuyers.length > 0
  const roundInfo = selectedRound
    ? `Round ${selectedRound.round_number} • ${scopeLabel(selectedRound.scope)} • ${selectedRound.status}`
    : 'No round selected'

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Invite buyers</h1>
          <div style={{ color: '#666' }}>
            Lot: <b>{lot?.title ?? lotId}</b> • <b>{roundInfo}</b>
          </div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>
            Tokens detected from lot: <b>{lotTokens.slice(0, 12).join(', ') || '—'}</b>
            {lotTokens.length > 12 ? <span> …</span> : null}
          </div>
        </div>

        {/* Round controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Round</div>
            <select
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              style={{ padding: 10, border: '1px solid #ddd', borderRadius: 10, minWidth: 220 }}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  Round {r.round_number} — {scopeLabel(r.scope)} ({r.status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={startNewRound}
            disabled={savingRound}
            style={{ padding: '10px 12px', borderRadius: 10 }}
            title="Creates a new round (Round 2+ defaults to leftovers only)"
          >
            {savingRound ? 'Working…' : 'Start new round'}
          </button>

          {selectedRound ? (
            <>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Scope</div>
                <select
                  value={selectedRound.scope}
                  onChange={(e) => updateRound({ scope: e.target.value as 'all' | 'unsold' | 'custom' })}
                  disabled={savingRound}
                  style={{ padding: 10, border: '1px solid #ddd', borderRadius: 10, minWidth: 170 }}
                >
                  <option value="all">All items</option>
                  <option value="unsold">Leftovers only</option>
                  <option value="custom">Custom (later)</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Status</div>
                <select
                  value={selectedRound.status}
                  onChange={(e) => updateRound({ status: e.target.value as 'live' | 'closed' })}
                  disabled={savingRound}
                  style={{ padding: 10, border: '1px solid #ddd', borderRadius: 10, minWidth: 150 }}
                >
                  <option value="live">Live</option>
                  <option value="closed">Closed</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: showRightPanel ? '1fr 380px' : '1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* LEFT */}
        <div>
          <h2 style={{ marginTop: 0 }}>Top matches (ranked)</h2>
          <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>
            Ranked by tag matches + credit + reliability + conversion rate + speed-to-PO + recency.
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top10.map((b) => (
              <BuyerCard key={b.id} b={b} />
            ))}
            {top10.length === 0 ? (
              <div style={{ color: '#666' }}>
                No tag matches yet. Add tags to buyers (e.g. “dell”, “cisco”) or ensure your import produces clear model tokens.
              </div>
            ) : null}
          </div>

          <hr style={{ margin: '18px 0' }} />

          <h2>All buyers with relevant tags ({allMatched.length})</h2>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allMatched.map((b) => (
              <BuyerCard key={b.id} b={b} />
            ))}
            {allMatched.length === 0 ? <div style={{ color: '#666' }}>No buyers matched tags for this lot.</div> : null}
          </div>

          <hr style={{ margin: '18px 0' }} />

          <h2>Browse all buyers</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <input
              value={browseQ}
              onChange={(e) => setBrowseQ(e.target.value)}
              placeholder="Search name / company / email..."
              style={{ width: 360, padding: 10, border: '1px solid #ddd', borderRadius: 10 }}
            />
            <div style={{ color: '#666', fontSize: 12 }}>
              Page {browsePage}/{browsePages} • Showing {browseBuyers.length} of {browseTotal}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button disabled={browsePage === 1} onClick={() => loadBrowseBuyers(tenantId, 1, browseQ)} style={{ padding: 8 }}>
              First
            </button>
            <button
              disabled={browsePage === 1}
              onClick={() => loadBrowseBuyers(tenantId, Math.max(1, browsePage - 1), browseQ)}
              style={{ padding: 8 }}
            >
              Prev
            </button>
            <button
              disabled={browsePage >= browsePages}
              onClick={() => loadBrowseBuyers(tenantId, Math.min(browsePages, browsePage + 1), browseQ)}
              style={{ padding: 8 }}
            >
              Next
            </button>
            <button disabled={browsePage >= browsePages} onClick={() => loadBrowseBuyers(tenantId, browsePages, browseQ)} style={{ padding: 8 }}>
              Last
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {browseBuyers.map((b) => (
              <BuyerCard key={b.id} b={b} />
            ))}
            {browseBuyers.length === 0 ? <div style={{ color: '#666' }}>No buyers found.</div> : null}
          </div>
        </div>

        {/* RIGHT PANEL */}
        {showRightPanel ? (
          <aside
            style={{
              border: '1px solid #ddd',
              borderRadius: 12,
              padding: 12,
              position: 'sticky',
              top: 16,
              height: 'fit-content',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Selected buyers</div>
                <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                  {selectedBuyers.length} selected • Round {selectedRound?.round_number ?? '—'}
                </div>
              </div>

              <button onClick={copyAll} style={{ padding: '10px 12px', borderRadius: 10 }}>
                Copy all
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedBuyers.map((b) => {
                const inv = inviteByBuyerId.get(b.id)
                const base = buildBaseUrl()
                const link = inv?.token ? `${base}/invite/${inv.token}` : '(missing invite)'
                return (
                  <div key={b.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>{b.name}</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                      {b.email ?? '(no email)'}
                    </div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4, wordBreak: 'break-all' }}>{link}</div>

                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => removeBuyer(b)}
                        disabled={savingBuyerId === b.id}
                        style={{ padding: '8px 10px', borderRadius: 10 }}
                      >
                        {savingBuyerId === b.id ? 'Working…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  )
}
