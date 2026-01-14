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
  phone: string | null
  accounts_email?: string | null
  linked_tenant_id?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postcode?: string | null
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
          width: 'min(980px, 96vw)',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--panel)',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
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
        <div style={{ padding: 14, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const [tenantId, setTenantId] = useState('')
  const [customers, setCustomers] = useState<BuyerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')

  // modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editBuyer, setEditBuyer] = useState<BuyerRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // form fields
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fCompany, setFCompany] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fAccountsEmail, setFAccountsEmail] = useState('')
  const [fTags, setFTags] = useState('')
  const [fCreditOk, setFCreditOk] = useState<boolean>(true)
  const [fReliability, setFReliability] = useState<string>('') // keep as string for input
  const [fTerms, setFTerms] = useState('')
  const [fAddr1, setFAddr1] = useState('')
  const [fAddr2, setFAddr2] = useState('')
  const [fCity, setFCity] = useState('')
  const [fState, setFState] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fPostcode, setFPostcode] = useState('')
  const [linkedTenantId, setLinkedTenantId] = useState('')
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'checking' | 'ok' | 'not_found' | 'same_tenant' | 'not_discoverable' | 'error'>('idle')
  const [lookupNote, setLookupNote] = useState('')
  const [lookupTenantName, setLookupTenantName] = useState('')

  const resetLookup = () => {
    setLookupStatus('idle')
    setLookupNote('')
    setLookupTenantName('')
    setLinkedTenantId('')
  }

  const openCreate = () => {
    setEditBuyer(null)
    setFName('')
    setFEmail('')
    setFCompany('')
    setFPhone('')
    setFAccountsEmail('')
    setFTags('')
    setFCreditOk(true)
    setFReliability('')
    setFTerms('')
    setFAddr1('')
    setFAddr2('')
    setFCity('')
    setFState('')
    setFCountry('')
    setFPostcode('')
    resetLookup()
    setEditOpen(true)
  }

  const openEdit = (b: BuyerRow) => {
    setEditBuyer(b)
    setFName(b.name ?? '')
    setFEmail(b.email ?? '')
    setFCompany(b.company ?? '')
    setFPhone(b.phone ?? '')
    setFAccountsEmail(b.accounts_email ?? '')
    setFTags(tagsToText(b.tags))
    setFCreditOk(Boolean(b.credit_ok ?? false))
    setFReliability(b.reliability_score === null || b.reliability_score === undefined ? '' : String(b.reliability_score))
    setFTerms(b.payment_terms ?? '')
    setFAddr1(b.address_line1 ?? '')
    setFAddr2(b.address_line2 ?? '')
    setFCity(b.city ?? '')
    setFState(b.state ?? '')
    setFCountry(b.country ?? '')
    setFPostcode(b.postcode ?? '')
    setLinkedTenantId(b.linked_tenant_id ?? '')
    setLookupStatus('idle')
    setLookupNote('')
    setLookupTenantName('')
    setEditOpen(true)
  }

  const closeEdit = () => {
    if (saving) return
    setEditOpen(false)
    setEditBuyer(null)
  }

  const loadCustomers = async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select(
          'id,tenant_id,name,email,company,phone,accounts_email,linked_tenant_id,address_line1,address_line2,city,state,country,postcode,tags,credit_ok,reliability_score,payment_terms,created_at'
        )
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })
        .limit(5000)

      if (error) throw error
      setCustomers((data as BuyerRow[]) ?? [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load customers'
      setError(msg)
      setCustomers([])
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
        await loadCustomers(profile.tenant_id)
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
    if (!s) return customers
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)
    return customers.filter((b) => {
      if (hit(b.name) || hit(b.email) || hit(b.company) || hit(b.id)) return true
      const tags = (b.tags ?? []).join(' ')
      if (hit(tags)) return true
      return false
    })
  }, [customers, q])

  const getToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token ?? null
    if (!token) throw new Error('Not authenticated')
    return token
  }

  const lookupTenantByEmail = async () => {
    const email = norm(fEmail).toLowerCase()
    if (!email) {
      setLookupStatus('error')
      setLookupNote('Enter an email address first.')
      return
    }
    setLookupStatus('checking')
    setLookupNote('')
    try {
      const token = await getToken()
      const res = await fetch('/api/customers/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      })
      const json = (await res.json()) as { ok?: boolean; reason?: string; message?: string; data?: Record<string, unknown> }

      if (!res.ok || !json.ok) {
        const reason = json.reason ?? 'error'
        if (reason === 'not_found') {
          setLookupStatus('not_found')
          setLookupNote('This user is not a user of The IT Exchange.')
        } else if (reason === 'same_tenant') {
          setLookupStatus('same_tenant')
          setLookupNote('User already belongs to your organisation.')
        } else if (reason === 'not_discoverable') {
          setLookupStatus('not_discoverable')
          setLookupNote('Tenant has not opted in to share details.')
        } else {
          setLookupStatus('error')
          setLookupNote(json.message || 'Lookup failed.')
        }
        setLinkedTenantId('')
        setLookupTenantName('')
        return
      }

      const data = json.data ?? {}
      const tenantName = typeof data.tenant_name === 'string' ? data.tenant_name : ''
      const linkedTenant = typeof data.linked_tenant_id === 'string' ? data.linked_tenant_id : ''
      setLookupTenantName(tenantName)
      setLinkedTenantId(linkedTenant)

      const companyName = typeof data.company_name === 'string' ? data.company_name : tenantName
      const contactName = typeof data.contact_name === 'string' ? data.contact_name : ''
      const contactPhone = typeof data.contact_phone === 'string' ? data.contact_phone : ''
      const accountsEmail = typeof data.accounts_email === 'string' ? data.accounts_email : ''
      const addressLine1 = typeof data.address_line1 === 'string' ? data.address_line1 : ''
      const addressLine2 = typeof data.address_line2 === 'string' ? data.address_line2 : ''

      if (!norm(fCompany) && companyName) setFCompany(companyName)
      if (!norm(fName) && contactName) setFName(contactName)
      if (!norm(fPhone) && contactPhone) setFPhone(contactPhone)
      if (!norm(fAccountsEmail) && accountsEmail) setFAccountsEmail(accountsEmail)
      if (!norm(fAddr1) && addressLine1) setFAddr1(addressLine1)
      if (!norm(fAddr2) && addressLine2) setFAddr2(addressLine2)

      setLookupStatus('ok')
      setLookupNote(tenantName ? `Auto-filled from ${tenantName}.` : 'Auto-filled from tenant details.')
    } catch (e: unknown) {
      console.error(e)
      setLookupStatus('error')
      setLookupNote(e instanceof Error ? e.message : 'Lookup failed.')
    }
  }

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

    const phone = norm(fPhone)

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
            phone: phone || null,
            accounts_email: norm(fAccountsEmail) ? norm(fAccountsEmail) : null,
            linked_tenant_id: linkedTenantId || null,
            address_line1: norm(fAddr1) || null,
            address_line2: norm(fAddr2) || null,
            city: norm(fCity) || null,
            state: norm(fState) || null,
            country: norm(fCountry) || null,
            postcode: norm(fPostcode) || null,
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
          phone: phone || null,
          accounts_email: norm(fAccountsEmail) ? norm(fAccountsEmail) : null,
          linked_tenant_id: linkedTenantId || null,
          address_line1: norm(fAddr1) || null,
          address_line2: norm(fAddr2) || null,
          city: norm(fCity) || null,
          state: norm(fState) || null,
          country: norm(fCountry) || null,
          postcode: norm(fPostcode) || null,
          tags: tagsArr.length ? tagsArr : [],
          credit_ok: fCreditOk,
          reliability_score: reliability,
          payment_terms: norm(fTerms) ? norm(fTerms) : null,
        })
        if (error) throw error
      }

      // refresh list for consistency
      await loadCustomers(tenantId)
      setEditOpen(false)
      setEditBuyer(null)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to save customer'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  const deleteBuyer = async (b: BuyerRow) => {
    if (!tenantId || deletingId) return
    const confirmed = window.confirm(`Delete customer "${b.name}"? This cannot be undone.`)
    if (!confirmed) return
    setDeletingId(b.id)
    try {
      const { error } = await supabase.from('buyers').delete().eq('tenant_id', tenantId).eq('id', b.id)
      if (error) throw error
      setCustomers((prev) => prev.filter((row) => row.id !== b.id))
    } catch (e: unknown) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to delete customer')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Customers</h1>
          <div style={{ color: 'var(--muted)' }}>Manage customer profiles, tags, and performance inputs.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers…"
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
            Add customer
          </button>

          <button
            onClick={() => tenantId && loadCustomers(tenantId)}
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
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading...</div> : null}

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
                  {b.company ? <span style={{ color: 'var(--muted)', fontWeight: 800 }}> | {b.company}</span> : null}
                </div>
                <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>
                    {b.email ?? '(no email)'}
                    {b.phone ? ` | ${b.phone}` : ''}
                    {` | Created: ${new Date(b.created_at).toLocaleDateString()}`}
                </div>

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Pill>Credit: {b.credit_ok ? 'OK' : 'Flag'}</Pill>
                    <Pill>Reliability: {b.reliability_score ?? '?'}</Pill>
                    <Pill>Terms: {b.payment_terms ?? '?'}</Pill>
                    <Pill>Tags: {(b.tags ?? []).length ? (b.tags ?? []).length : '0'}</Pill>
                  </div>

                  {(b.tags ?? []).length ? (
                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                      {(b.tags ?? []).slice(0, 14).join(', ')}
                      {(b.tags ?? []).length > 14 ? ' �Ǫ' : ''}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      if (!b.email) return
                      const mailto = `mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent('Hello from The IT Exchange')}`
                      window.open(mailto, '_blank')
                    }}
                    disabled={!b.email}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      fontWeight: 900,
                      cursor: b.email ? 'pointer' : 'not-allowed',
                      opacity: b.email ? 1 : 0.6,
                    }}
                  >
                    Email
                  </button>

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
                    Edit customer
                  </button>

                  <button
                    onClick={() => deleteBuyer(b)}
                    disabled={deletingId === b.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(220,38,38,0.12)',
                      fontWeight: 900,
                      cursor: deletingId === b.id ? 'wait' : 'pointer',
                    }}
                  >
                    {deletingId === b.id ? 'Deleting…' : 'Delete customer'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? <div style={{ color: 'var(--muted)' }}>No customers found.</div> : null}
        </div>
      ) : null}

      {editOpen ? (
        <ModalShell title={editBuyer ? `Edit customer � ${editBuyer.name}` : 'Add customer'} onClose={closeEdit}>
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
                onChange={(e) => {
                  setFEmail(e.target.value)
                  resetLookup()
                }}
                placeholder="name@company.com"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={lookupTenantByEmail}
                  disabled={lookupStatus === 'checking'}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 900,
                    cursor: lookupStatus === 'checking' ? 'wait' : 'pointer',
                  }}
                >
                  {lookupStatus === 'checking' ? 'Looking up...' : 'Lookup tenant'}
                </button>
                {lookupNote ? (
                  <div style={{ color: lookupStatus === 'ok' ? 'var(--good)' : 'var(--muted)', fontSize: 12 }}>
                    {lookupNote}
                  </div>
                ) : null}
                {lookupTenantName ? (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tenant: {lookupTenantName}</div>
                ) : null}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Phone</div>
              <input
                value={fPhone}
                onChange={(e) => setFPhone(e.target.value)}
                placeholder="+1 555 123 4567"
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
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Accounts email</div>
              <input
                value={fAccountsEmail}
                onChange={(e) => setFAccountsEmail(e.target.value)}
                placeholder="accounts@company.com"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                }}
              />
            </div>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Street address 1</div>
            <input
              value={fAddr1}
              onChange={(e) => setFAddr1(e.target.value)}
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Street address 2</div>
            <input
              value={fAddr2}
              onChange={(e) => setFAddr2(e.target.value)}
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Town/City</div>
            <input
              value={fCity}
              onChange={(e) => setFCity(e.target.value)}
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>County/State</div>
            <input
              value={fState}
              onChange={(e) => setFState(e.target.value)}
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Country</div>
            <input
              value={fCountry}
              onChange={(e) => setFCountry(e.target.value)}
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
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Zip/Post code</div>
            <input
              value={fPostcode}
              onChange={(e) => setFPostcode(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
              }}
            />
          </div>
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
                Used in customer ranking + recommended invites.
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
                Tip: keep it simple (0���5). You can refine later.
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
                These drive intelligent matching with lots.
              </div>
            </div>
          </div>

          <hr style={{ margin: '14px 0', borderColor: 'var(--border)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {editBuyer ? (
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                Buyer ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{editBuyer.id}</span>
              </div>
            ) : (
              <div />
            )}

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
                {saving ? 'Saving�Ǫ' : 'Save changes'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  )
}











