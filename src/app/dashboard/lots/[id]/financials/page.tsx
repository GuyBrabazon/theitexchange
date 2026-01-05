'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Lot = {
  id: string
  tenant_id: string
  title: string | null
  currency: string | null
  status: string | null
}

type CostBasis = 'stock_cost' | 'asking_known' | 'asking_unknown'

type LotFinancials = {
  lot_id: string
  tenant_id: string
  cost_basis: CostBasis
  cost_total: number | null
  asking_total: number | null
  target_margin: number
  notes: string | null
  created_at?: string
  updated_at?: string
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x))
}

function money(v: number | null | undefined, currency: string) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const rounded = Math.round(Number(v) * 100) / 100
  return `${rounded.toLocaleString()} ${currency}`
}

function basisLabel(b: CostBasis) {
  if (b === 'stock_cost') return 'Stock (cost known)'
  if (b === 'asking_known') return 'On offer (asking known)'
  return 'On offer (asking unknown)'
}

export default function LotFinancialsPage() {
  const params = useParams()
  const lotId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [tenantId, setTenantId] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)

  // editable fields
  const [costBasis, setCostBasis] = useState<CostBasis>('asking_unknown')
  const [costTotal, setCostTotal] = useState<string>('') // string for input
  const [askingTotal, setAskingTotal] = useState<string>('') // string for input
  const [targetMarginPct, setTargetMarginPct] = useState<string>('20') // in percent for UI
  const [notes, setNotes] = useState<string>('')

  const currency = useMemo(() => lot?.currency ?? 'USD', [lot])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)

      // Load lot
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .select('id,tenant_id,title,currency,status')
        .eq('id', lotId)
        .single()
      if (lotErr) throw lotErr
      setLot(lotData as Lot)

      // Load existing financials (if any)
      const { data: finData, error: finErr } = await supabase
        .from('lot_financials')
        .select('lot_id,tenant_id,cost_basis,cost_total,asking_total,target_margin,notes,created_at,updated_at')
        .eq('lot_id', lotId)
        .maybeSingle()

      if (finErr) throw finErr

      if (finData) {
        const f = finData as LotFinancials
        setCostBasis(f.cost_basis)
        setCostTotal(f.cost_total == null ? '' : String(f.cost_total))
        setAskingTotal(f.asking_total == null ? '' : String(f.asking_total))
        setTargetMarginPct(String(Math.round(Number(f.target_margin ?? 0.2) * 1000) / 10)) // e.g. 0.2 => 20
        setNotes(f.notes ?? '')
      } else {
        // default sensible
        setCostBasis('asking_unknown')
        setCostTotal('')
        setAskingTotal('')
        setTargetMarginPct('20')
        setNotes('')
      }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load financials'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [lotId])

  useEffect(() => {
    load()
  }, [load])

  const computedPreview = useMemo(() => {
    // "profit" preview needs revenue; we don't have it on this page.
    // But we can preview the chosen basis inputs.
    const m = clamp((Number(targetMarginPct || '0') || 0) / 100, 0, 0.8)
    const c = n(costTotal)
    const a = n(askingTotal)
    return { margin: m, cost: c, asking: a }
  }, [targetMarginPct, costTotal, askingTotal])

  const validate = () => {
    if (!tenantId) return 'Missing tenant'
    if (!lotId) return 'Missing lot id'

    if (costBasis === 'stock_cost') {
      const c = n(costTotal)
      if (c == null || c < 0) return 'Enter a valid Cost total (>= 0)'
    }

    if (costBasis === 'asking_known') {
      const a = n(askingTotal)
      if (a == null || a < 0) return 'Enter a valid Asking total (>= 0)'
    }

    if (costBasis === 'asking_unknown') {
      const m = (Number(targetMarginPct || '0') || 0) / 100
      if (!Number.isFinite(m) || m <= 0 || m > 0.8) return 'Target margin should be between 1% and 80%'
    }

    return ''
  }

  const save = async () => {
    const v = validate()
    if (v) {
      alert(v)
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload: LotFinancials = {
        lot_id: lotId,
        tenant_id: tenantId,
        cost_basis: costBasis,
        cost_total: costBasis === 'stock_cost' ? n(costTotal) : null,
        asking_total: costBasis === 'asking_known' ? n(askingTotal) : null,
        target_margin:
          costBasis === 'asking_unknown'
            ? clamp((Number(targetMarginPct || '0') || 0) / 100, 0, 0.8)
            : 0.2, // keep a sensible default stored even if unused
        notes: notes.trim() ? notes.trim() : null,
      }

      const { error: upErr } = await supabase.from('lot_financials').upsert(payload, { onConflict: 'lot_id' })
      if (upErr) throw upErr

      alert('Saved lot financials.')
      await load()
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to save'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href={`/dashboard/lots/${lotId}`} style={{ textDecoration: 'none' }}>
            ← Back to lot
          </Link>
          <button onClick={load} style={{ padding: 10, borderRadius: 10 }}>
            Retry
          </button>
        </div>

        <div style={{ marginTop: 14, color: 'crimson' }}>{error}</div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Lot financials</h1>
          <div style={{ color: 'var(--muted)' }}>
            Lot:{' '}
            <b style={{ color: 'var(--text)' }}>
              {lot?.title ?? lotId}
            </b>{' '}
            • Currency:{' '}
            <b style={{ color: 'var(--text)' }}>
              {currency}
            </b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href={`/dashboard/lots/${lotId}`}
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
            }}
          >
            ← Back to lot
          </Link>

          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 950,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* LEFT: form */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: 10 }}>Profit inputs</div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 850 }}>Cost basis</div>
            <select
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value as CostBasis)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
              }}
            >
              <option value="stock_cost">{basisLabel('stock_cost')}</option>
              <option value="asking_known">{basisLabel('asking_known')}</option>
              <option value="asking_unknown">{basisLabel('asking_unknown')}</option>
            </select>

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 850 }}>Cost total</div>
            <input
              value={costTotal}
              onChange={(e) => setCostTotal(e.target.value)}
              disabled={costBasis !== 'stock_cost'}
              placeholder={`e.g. 12000 (${currency})`}
              inputMode="decimal"
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: costBasis === 'stock_cost' ? 'var(--panel)' : 'rgba(15,23,42,0.04)',
                fontWeight: 850,
              }}
            />

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 850 }}>Asking total</div>
            <input
              value={askingTotal}
              onChange={(e) => setAskingTotal(e.target.value)}
              disabled={costBasis !== 'asking_known'}
              placeholder={`e.g. 15000 (${currency})`}
              inputMode="decimal"
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: costBasis === 'asking_known' ? 'var(--panel)' : 'rgba(15,23,42,0.04)',
                fontWeight: 850,
              }}
            />

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 850 }}>Target margin</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={targetMarginPct}
                onChange={(e) => setTargetMarginPct(e.target.value)}
                disabled={costBasis !== 'asking_unknown'}
                placeholder="20"
                inputMode="decimal"
                style={{
                  width: 120,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: costBasis === 'asking_unknown' ? 'var(--panel)' : 'rgba(15,23,42,0.04)',
                  fontWeight: 850,
                }}
              />
              <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 850 }}>%</span>

              {costBasis === 'asking_unknown' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[15, 20, 25].map((p) => (
                    <button
                      key={p}
                      onClick={() => setTargetMarginPct(String(p))}
                      type="button"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--border)',
                        background: 'rgba(15,23,42,0.02)',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 850, alignSelf: 'start' }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: source of cost/asking, special terms, etc."
              rows={4}
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 750,
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
            • <b>Stock (cost known)</b> uses <b>Cost total</b> as the baseline.<br />
            • <b>On offer (asking known)</b> uses <b>Asking total</b> as the baseline.<br />
            • <b>Asking unknown</b> estimates profit as <b>Revenue × target margin</b> (15–25% typical).
          </div>
        </div>

        {/* RIGHT: preview */}
        <aside
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
            padding: 14,
            position: 'sticky',
            top: 16,
            height: 'fit-content',
          }}
        >
          <div style={{ fontWeight: 950 }}>Preview</div>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            This page doesn’t know revenue. It just validates your inputs so Analytics can compute profit.
          </div>

          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cost basis</div>
            <div style={{ fontWeight: 950, marginTop: 4 }}>{basisLabel(costBasis)}</div>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Cost total</span>
                <span style={{ fontWeight: 950 }}>{money(computedPreview.cost, currency)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Asking total</span>
                <span style={{ fontWeight: 950 }}>{money(computedPreview.asking, currency)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Target margin</span>
                <span style={{ fontWeight: 950 }}>{Math.round(computedPreview.margin * 1000) / 10}%</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              href={`/dashboard/analytics`}
              style={{
                textDecoration: 'none',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'rgba(15,23,42,0.02)',
                fontWeight: 950,
                textAlign: 'center',
              }}
            >
              View Analytics →
            </Link>

            <Link
              href={`/dashboard/lots/${lotId}`}
              style={{
                textDecoration: 'none',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
                textAlign: 'center',
              }}
            >
              Back to Lot →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  )
}
