'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type SellerRow = {
  id: string
  tenant_id: string | null
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postcode?: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

type EditDraft = {
  id?: string
  name: string
  company: string
  email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  country: string
  postcode: string
  notes: string
}

function safeStr(v: unknown) {
  return String(v ?? '').trim()
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 10px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'rgba(0,0,0,0.16)',
              color: 'var(--text)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  )
}

export default function SuppliersPage() {
  const [tenantId, setTenantId] = useState<string>('')

  const [rows, setRows] = useState<SellerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [draft, setDraft] = useState<EditDraft>({
    name: '',
    company: '',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    postcode: '',
    notes: '',
  })

  const isEditing = Boolean(draft.id)

  const load = async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select(
          'id,tenant_id,name,company,email,phone,address_line1,address_line2,city,state,country,postcode,notes,created_at,updated_at'
        )
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRows((data as SellerRow[]) ?? [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load suppliers'
      setError(msg)
      setRows([])
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
        await load(profile.tenant_id)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to bootstrap tenant'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)
    return rows.filter((r) => hit(r.name) || hit(r.company) || hit(r.email) || hit(r.phone) || hit(r.notes) || hit(r.id))
  }, [rows, q])

  const openCreate = () => {
    setDraft({
      name: '',
      company: '',
      email: '',
      phone: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      country: '',
      postcode: '',
      notes: '',
    })
    setModalOpen(true)
  }

  const openEdit = (r: SellerRow) => {
    setDraft({
      id: r.id,
      name: r.name ?? '',
      company: r.company ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      address_line1: r.address_line1 ?? '',
      address_line2: r.address_line2 ?? '',
      city: r.city ?? '',
      state: r.state ?? '',
      country: r.country ?? '',
      postcode: r.postcode ?? '',
      notes: r.notes ?? '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
  }

  const save = async () => {
    if (!tenantId) return
    const name = safeStr(draft.name)
    if (!name) {
      alert('Name is required.')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, string | null> = {
        tenant_id: tenantId,
        name,
        company: safeStr(draft.company) || null,
        email: safeStr(draft.email) || null,
        phone: safeStr(draft.phone) || null,
        address_line1: safeStr(draft.address_line1) || null,
        address_line2: safeStr(draft.address_line2) || null,
        city: safeStr(draft.city) || null,
        state: safeStr(draft.state) || null,
        country: safeStr(draft.country) || null,
        postcode: safeStr(draft.postcode) || null,
        notes: safeStr(draft.notes) || null,
      }

      if (draft.id) {
        const { error } = await supabase.from('sellers').update(payload).eq('id', draft.id)
        if (error) throw error
      } else {
        // tenant_id also defaults server-side, but we set it explicitly for clarity
        const { error } = await supabase.from('sellers').insert(payload)
        if (error) throw error
      }

      setModalOpen(false)
      await load(tenantId)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to save supplier'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (r: SellerRow) => {
    if (!tenantId) return
    const ok = confirm(`Delete supplier "${r.name}"? This cannot be undone.`)
    if (!ok) return

    setDeletingId(r.id)
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', r.id)
      if (error) throw error
      await load(tenantId)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to delete supplier'
      alert(msg)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Suppliers</h1>
          <div style={{ color: 'var(--muted)' }}>Manage supplier profiles (sources / suppliers).</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search suppliers…"
            style={{
              width: 320,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--panel)',
              color: 'var(--text)',
            }}
          />

          <button
            onClick={openCreate}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            + New supplier
          </button>

          <button
            onClick={() => tenantId && load(tenantId)}
            disabled={!tenantId || loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
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
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 12,
                background: 'var(--panel)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 320 }}>
                  <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>
                    {r.name}
                    {r.company ? <span style={{ color: 'var(--muted)', fontWeight: 800 }}> • {r.company}</span> : null}
                  </div>

                  <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>Email: <b style={{ color: 'var(--text)' }}>{r.email ?? '—'}</b></span>
                    <span>Phone: <b style={{ color: 'var(--text)' }}>{r.phone ?? '—'}</b></span>
                    <span>Updated: <b style={{ color: 'var(--text)' }}>{fmtDate(r.updated_at)}</b></span>
                  </div>

                  {r.notes ? (
                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                      {r.notes}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      if (!r.email) return
                      const mailto = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent('Hello from The IT Exchange')}`
                      window.open(mailto, '_blank')
                    }}
                    disabled={!r.email}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      fontWeight: 900,
                      cursor: r.email ? 'pointer' : 'not-allowed',
                      opacity: r.email ? 1 : 0.6,
                    }}
                  >
                    Email
                  </button>

                  <button
                    onClick={() => openEdit(r)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'rgba(245,174,109,0.12)',
                      color: 'var(--text)',
                      fontWeight: 950,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => remove(r)}
                    disabled={deletingId === r.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'rgba(220,38,38,0.12)',
                      color: 'var(--text)',
                      fontWeight: 950,
                      cursor: 'pointer',
                    }}
                  >
                    {deletingId === r.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? <div style={{ color: 'var(--muted)' }}>No suppliers found.</div> : null}
        </div>
      ) : null}

      <Modal title={isEditing ? 'Edit supplier' : 'New supplier'} open={modalOpen} onClose={closeModal}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Name *</div>
            <input
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="Seller name"
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Company</div>
            <input
              value={draft.company}
              onChange={(e) => setDraft((p) => ({ ...p, company: e.target.value }))}
              placeholder="Company (optional)"
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Email</div>
            <input
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@company.com"
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Phone</div>
            <input
              value={draft.phone}
              onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+27 …"
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Street address 1</div>
            <input
              value={draft.address_line1}
              onChange={(e) => setDraft((p) => ({ ...p, address_line1: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Street address 2</div>
            <input
              value={draft.address_line2}
              onChange={(e) => setDraft((p) => ({ ...p, address_line2: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Town/City</div>
            <input
              value={draft.city}
              onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>County/State</div>
            <input
              value={draft.state}
              onChange={(e) => setDraft((p) => ({ ...p, state: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Country</div>
            <input
              value={draft.country}
              onChange={(e) => setDraft((p) => ({ ...p, country: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Zip/Post code</div>
            <input
              value={draft.postcode}
              onChange={(e) => setDraft((p) => ({ ...p, postcode: e.target.value }))}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            />
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Notes</div>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Internal notes (payment behavior, pickup terms, preferred comms, etc.)"
              rows={4}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--panel)',
                color: 'var(--text)',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={closeModal}
            disabled={saving}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'rgba(0,0,0,0.18)',
              color: 'var(--text)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>
    </main>
  )
}
