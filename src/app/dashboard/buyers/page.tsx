'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type BuyerRow = {
  id: string
  tenant_id: string
  name: string
  email: string | null
  company: string | null
  tags: string[] | null
  credit_ok: boolean | null
  reliability_score: number | null
  payment_terms: string | null
  created_at: string
}

function norm(s: string) {
  return (s ?? '').trim()
}

function parseTags(input: string): string[] {
  // allow commas or newlines
  const parts = input
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
  // de-dupe, preserve order
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function tagsToText(tags: string[] | null | undefined) {
  return (tags ?? []).join(', ')
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  )
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        // click outside closes
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 'min(720px, 96vw)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          boxShadow: 'var(--shadow)',
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <div style={{ fontWeight: 950, fontSize: 16, letterSpacing: -0.2 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  )
}

export default function BuyersPage() {
  const [tenantId, setTenantId] = useState('')
  const [buyers, setBuyers] = useState<BuyerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')

  // modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editBuyer, setEditBuyer] = useState<BuyerRow | null>(null)
  const [saving, setSaving] = useState(false)

  // form fields
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fCompany, setFCompany] = useState('')
  const [fTags, setFTags] = useState('')
  const [fCreditOk, setFCreditOk] = useState<boolean>(true)
  const [fReliability, setFReliability] = useState<string>('') // keep as string for input
  const [fTerms, setFTerms] = useState('')

  const openCreate = () => {
    setEditBuyer(null)
    setFName('')
    setFEmail('')
    setFCompany('')
    setFTags('')
    setFCreditOk(true)
    setFReliability('')
    setFTerms('')
    setEditOpen(true)
  }

  const openEdit = (b: BuyerRow) => {
    setEditBuyer(b)
    setFName(b.name ?? '')
    setFEmail(b.email ?? '')
    setFCompany(b.company ?? '')
    setFTags(tagsToText(b.tags))
    setFCreditOk(Boolean(b.credit_ok ?? false))
    setFReliability(b.reliability_score === null || b.reliability_score === undefined ? '' : String(b.reliability_score))
    setFTerms(b.payment_terms ?? '')
    setEditOpen(true)
  }

  const closeEdit = () => {
    if (saving) return
    setEditOpen(false)
    setEditBuyer(null)
  }

  const loadBuyers = async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select('id,tenant_id,name,email,company,tags,credit_ok,reliability_score,payment_terms,created_at')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })
        .limit(5000)

      if (error) throw error
      setBuyers((data as BuyerRow[]) ?? [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load buyers'
      setError(msg)
      setBuyers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)
        await loadBuyers(profile.tenant_id)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to bootstrap'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return buyers
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)
    return buyers.filter((b) => {
      if (hit(b.name) || hit(b.email) || hit(b.company) || hit(b.id)) return true
      const tags = (b.tags ?? []).join(' ')
      if (hit(tags)) return true
      return false
    })
  }, [buyers, q])

  const saveEdit = async () => {
    if (!tenantId) return
    if (saving) return

    const name = norm(fName)
    if (!name) {
      alert('Name is required.')
      return
    }

    // reliability: allow blank => null
    let reliability: number | null = null
    if (norm(fReliability)) {
      const v = Number(fReliability)
      if (!Number.isFinite(v)) {
        alert('Reliability score must be a number (or leave blank).')
        return
      }
      reliability = v
    }

    const tagsArr = parseTags(fTags)

    setSaving(true)
    try {
      if (editBuyer) {
        const { error } = await supabase
          .from('buyers')
          .update({
            name,
            email: norm(fEmail) ? norm(fEmail) : null,
            company: norm(fCompany) ? norm(fCompany) : null,
            tags: tagsArr.length ? tagsArr : [],
            credit_ok: fCreditOk,
            reliability_score: reliability,
            payment_terms: norm(fTerms) ? norm(fTerms) : null,
          })
          .eq('tenant_id', tenantId)
          .eq('id', editBuyer.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('buyers').insert({
          tenant_id: tenantId,
          name,
          email: norm(fEmail) ? norm(fEmail) : null,
          email_norm: norm(fEmail) ? norm(fEmail).toLowerCase() : null,
          company: norm(fCompany) ? norm(fCompany) : null,
          tags: tagsArr.length ? tagsArr : [],
          credit_ok: fCreditOk,
          reliability_score: reliability,
          payment_terms: norm(fTerms) ? norm(fTerms) : null,
        })
        if (error) throw error
      }

      // refresh list for consistency
      await loadBuyers(tenantId)
      setEditOpen(false)
      setEditBuyer(null)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to save buyer'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Buyers</h1>
          <div style={{ color: 'var(--muted)' }}>Manage buyer profiles, tags, and performance inputs.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search buyers…"
            style={{
              width: 320,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--panel)',
            }}
          />

          <Link
            href="/dashboard/buyers/import"
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              color: 'var(--text)',
            }}
          >
            Import
          </Link>

          <button
            onClick={openCreate}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--accent-soft)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Add buyer
          </button>

          <button
            onClick={() => tenantId && loadBuyers(tenantId)}
            disabled={!tenantId || loading}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}
      {loading ? <div style={{ color: 'var(--muted)' }}>Loadingâ€¦</div> : null}

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((b) => (
            <div
              key={b.id}
              style={{
                border: '1px solid var(--border)',
           borderRadius: 'var(--r-lg)',
                background: 'var(--panel)',
                boxShadow: 'var(--shadow)',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 320 }}>
                  <div style={{ fontWeight: 950, letterSpacing: -0.1, fontSize: 16 }}>
                    {b.name}
                    {b.company ? <span style={{ color: 'var(--muted)', fontWeight: 800 }}> â€¢ {b.company}</span> : null}
                  </div>
                  <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>
                    {b.email ?? '(no email)'} â€¢ Created: {new Date(b.created_at).toLocaleDateString()}
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Pill>Credit: {b.credit_ok ? 'OK' : 'Flag'}</Pill>
                    <Pill>Reliability: {b.reliability_score ?? 'â€”'}</Pill>
                    <Pill>Terms: {b.payment_terms ?? 'â€”'}</Pill>
                    <Pill>Tags: {(b.tags ?? []).length ? (b.tags ?? []).length : '0'}</Pill>
                  </div>

                  {(b.tags ?? []).length ? (
                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                      {(b.tags ?? []).slice(0, 14).join(', ')}
                      {(b.tags ?? []).length > 14 ? ' â€¦' : ''}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => openEdit(b)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--accent-soft)',
                      fontWeight: 950,
                      cursor: 'pointer',
                    }}
                  >
                    Edit buyer
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? <div style={{ color: 'var(--muted)' }}>No buyers found.</div> : null}
        </div>
      ) : null}

      {editOpen ? (
        <ModalShell title={editBuyer ? `Edit buyer · ${editBuyer.name}` : 'Add buyer'} onClose={closeEdit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Name</div>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Email</div>
              <input
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder="name@company.com"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Company</div>
              <input
                value={fCompany}
                onChange={(e) => setFCompany(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Payment terms</div>
              <input
                value={fTerms}
                onChange={(e) => setFTerms(e.target.value)}
                placeholder='e.g. "Net 7", "COD", "Wire upfront"'
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Credit OK</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={fCreditOk}
                    onChange={(e) => setFCreditOk(e.target.checked)}
                  />
                  Credit approved
                </label>
              </div>
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                Used in buyer ranking + recommended invites.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Reliability score</div>
              <input
                value={fReliability}
                onChange={(e) => setFReliability(e.target.value)}
                placeholder="0 - 5 (leave blank for unknown)"
                inputMode="decimal"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                Tip: keep it simple (0â€“5). You can refine later.
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Tags</div>
              <textarea
                value={fTags}
                onChange={(e) => setFTags(e.target.value)}
                placeholder="Comma-separated tags, e.g. dell, cisco, lenovo"
                rows={3}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  resize: 'vertical',
                }}
              />
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                These drive matching on the Invite Buyers page (e.g. â€œdellâ€, â€œciscoâ€).
              </div>
            </div>
          </div>

          <hr style={{ margin: '14px 0', borderColor: 'var(--border)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Buyer ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{editBuyer.id}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={closeEdit}
                disabled={saving}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                disabled={saving}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                  color: '#fff',
                  fontWeight: 950,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Savingâ€¦' : 'Save changes'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  )
}



