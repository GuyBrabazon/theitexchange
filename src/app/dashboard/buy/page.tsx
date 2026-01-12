"use client"

import { useEffect, useMemo, useState } from 'react'
import { ensureProfile } from '@/lib/bootstrap'
import { supabase } from '@/lib/supabase'

type SupplierResult = {
  supplier_tenant_id: string
  supplier_name: string
  items: {
    id: string
    model: string | null
    description: string | null
    oem: string | null
    condition: string | null
    qty_available: number | null
    qty_total: number | null
    status: string | null
    location: string | null
    currency: string | null
    cost: number | null
  }[]
}

export default function BuyPage() {
  const [, setTenantId] = useState('')
  const [term, setTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SupplierResult[]>([])
  const [selected, setSelected] = useState<Record<string, { qty: string; supplier: string }>>({})
  const [sending, setSending] = useState(false)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [poModalOpen, setPoModalOpen] = useState(false)
  const [poSupplierQuery, setPoSupplierQuery] = useState('')
  const [poSupplierResults, setPoSupplierResults] = useState<Array<{ id: string; name: string; email: string | null }>>([])
  const [poSelectedSupplier, setPoSelectedSupplier] = useState<{ id: string; name: string; email: string | null } | null>(null)
  const [poItemQuery, setPoItemQuery] = useState('')
  const [poItemResults, setPoItemResults] = useState<Array<{ id: string; model: string | null; description: string | null }>>([])
  const [poSelectedItems, setPoSelectedItems] = useState<Record<string, { qty: string }>>({})
  const [poManual, setPoManual] = useState(false)
  const [poManualDesc, setPoManualDesc] = useState('')
  const [poManualQty, setPoManualQty] = useState('1')
  const [poTerms, setPoTerms] = useState('')
  const [poCreating, setPoCreating] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)
        const {
          data: { session },
        } = await supabase.auth.getSession()
        setAuthToken(session?.access_token ?? null)
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      }
    }
    init()
  }, [])

  const getToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token ?? null
    setAuthToken(token)
    if (!token) throw new Error('Not authenticated. Please sign in again.')
    return token
  }

  const runSearch = async () => {
    if (!term.trim()) {
      setResults([])
      return
    }
    try {
      setLoading(true)
      setError('')
      const token = authToken ?? (await getToken())
      const res = await fetch(`/api/buy/search?term=${encodeURIComponent(term)}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Search failed')
      setResults(json.results || [])
      setSelected({})
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = (supplierId: string, itemId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[itemId]) {
        delete next[itemId]
      } else {
        next[itemId] = { qty: '1', supplier: supplierId }
      }
      return next
    })
  }

  const setQty = (itemId: string, qty: string) => {
    setSelected((prev) => {
      if (!prev[itemId]) return prev
      return { ...prev, [itemId]: { ...prev[itemId], qty } }
    })
  }

  const selectedBySupplier = useMemo(() => {
    const map: Record<string, string[]> = {}
    Object.entries(selected).forEach(([itemId, meta]) => {
      if (!map[meta.supplier]) map[meta.supplier] = []
      map[meta.supplier].push(itemId)
    })
    return map
  }, [selected])

  const sendRfq = async (supplierId: string) => {
    const itemIds = selectedBySupplier[supplierId] || []
    if (!itemIds.length) {
      alert('Select at least one line for this supplier.')
      return
    }
    try {
      setSending(true)
      const lines = itemIds.map((id) => ({
        inventory_item_id: id,
        qty_requested: selected[id]?.qty ? Number(selected[id].qty) || null : null,
      }))
      const token = authToken ?? (await getToken())
      const res = await fetch('/api/buy/rfq', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplier_tenant_id: supplierId,
          subject: `RFQ: ${term}`.trim(),
          lines,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'RFQ failed')
      alert('RFQ sent.')
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'RFQ failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Buy</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>Search all suppliers for a part number and send RFQs.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setPoModalOpen(true)}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              textDecoration: 'none',
              fontWeight: 800,
              color: 'var(--text)',
            }}
          >
            New PO
          </button>
          <a
            href="/dashboard/my-rfqs"
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              textDecoration: 'none',
              fontWeight: 800,
              color: 'var(--text)',
            }}
          >
            My RFQs
          </a>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch()
            }}
            placeholder="Search part number / model / OEM"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 280, background: 'var(--panel)' }}
          />
          <button
            onClick={runSearch}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Search
          </button>
        </div>
        {error ? <div style={{ marginTop: 8, color: 'var(--bad)' }}>{error}</div> : null}
        {loading ? <div style={{ marginTop: 8, color: 'var(--muted)' }}>Searching...</div> : null}
      </div>

      {results.length === 0 && !loading ? (
        <div style={{ color: 'var(--muted)' }}>No results yet. Try searching for a part number.</div>
      ) : null}

      <div style={{ display: 'grid', gap: 12 }}>
      {results.map((sup) => {
        const selCount = (selectedBySupplier[sup.supplier_tenant_id] || []).length
        return (
          <div
            key={sup.supplier_tenant_id}
              style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 12, display: 'grid', gap: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{sup.supplier_name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Supplier tenant: {sup.supplier_tenant_id.slice(0, 8)}</div>
                </div>
                <button
                  onClick={() => sendRfq(sup.supplier_tenant_id)}
                  disabled={sending || selCount === 0}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: selCount ? 'var(--accent)' : 'var(--panel)',
                    color: selCount ? '#fff' : 'var(--text)',
                    fontWeight: 900,
                    cursor: selCount ? 'pointer' : 'not-allowed',
                  }}
                >
                  Send RFQ {selCount ? `(${selCount} lines)` : ''}
                </button>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.4fr 1.2fr 0.8fr 0.6fr 0.6fr 0.6fr 0.8fr',
                    background: 'var(--surface-2)',
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  <div style={{ padding: 8 }}>Select</div>
                  <div style={{ padding: 8 }}>Part / Description</div>
                  <div style={{ padding: 8 }}>OEM</div>
                  <div style={{ padding: 8 }}>Condition</div>
                  <div style={{ padding: 8 }}>Qty avail</div>
                  <div style={{ padding: 8 }}>Currency</div>
                  <div style={{ padding: 8 }}>Request qty</div>
                </div>

                {sup.items.map((it) => {
                  const isSelected = Boolean(selected[it.id])
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '0.4fr 1.2fr 0.8fr 0.6fr 0.6fr 0.6fr 0.8fr',
                        borderTop: '1px solid var(--border)',
                        fontSize: 13,
                        background: 'var(--panel)',
                      }}
                    >
                      <div style={{ padding: 8 }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleItem(sup.supplier_tenant_id, it.id)} />
                      </div>
                      <div style={{ padding: 8 }}>
                        <div style={{ fontWeight: 900 }}>{it.model || it.description || 'Unnamed part'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{it.description || '—'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Status: {it.status || 'available'}</div>
                        {it.location ? <div style={{ color: 'var(--muted)', fontSize: 11 }}>Location: {it.location}</div> : null}
                      </div>
                      <div style={{ padding: 8 }}>{it.oem || '—'}</div>
                      <div style={{ padding: 8 }}>{it.condition || '—'}</div>
                      <div style={{ padding: 8 }}>{it.qty_available ?? '—'}</div>
                      <div style={{ padding: 8 }}>{it.currency || 'USD'}</div>
                      <div style={{ padding: 8 }}>
                        <input
                          type="number"
                          min={0}
                          value={selected[it.id]?.qty ?? ''}
                          onChange={(e) => setQty(it.id, e.target.value)}
                          disabled={!isSelected}
                          placeholder="Qty"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  )
                })}

                {sup.items.length === 0 ? (
                  <div style={{ padding: 10, color: 'var(--muted)' }}>No lines for this supplier.</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {poModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(900px, 100%)',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Create PO</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Select supplier and lines to include.</div>
              </div>
              <button
                onClick={() => setPoModalOpen(false)}
                style={{ borderRadius: 999, border: '1px solid var(--border)', padding: '6px 10px', background: 'var(--panel)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Supplier</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search supplier"
                  value={poSupplierQuery}
                  onChange={(e) => setPoSupplierQuery(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 240 }}
                />
                <button
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase
                        .from('sellers')
                        .select('id,name,email')
                        .ilike('name', `%${poSupplierQuery || ''}%`)
                        .limit(20)
                      if (error) throw error
                      setPoSupplierResults(
                        (data || []).map((r) => ({
                          id: String(r.id),
                          name: (r.name as string) || 'Supplier',
                          email: (r.email as string | null) ?? null,
                        }))
                      )
                    } catch (err) {
                      console.error(err)
                      alert(err instanceof Error ? err.message : 'Supplier search failed')
                    }
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Search
                </button>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 160, overflow: 'auto' }}>
                {poSupplierResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPoSelectedSupplier(s)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: s.id === poSelectedSupplier?.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--panel)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.email || 'No email'}</div>
                  </button>
                ))}
                {!poSupplierResults.length ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>No supplier results yet.</div> : null}
                {poSelectedSupplier ? (
                  <div style={{ fontSize: 12, color: 'var(--good)' }}>Selected: {poSelectedSupplier.name}</div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Add equipment</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search inventory"
                  value={poItemQuery}
                  onChange={(e) => setPoItemQuery(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 260 }}
                />
                <button
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase
                        .from('inventory_items')
                        .select('id,model,description')
                        .or(`model.ilike.%${poItemQuery || ''}%,description.ilike.%${poItemQuery || ''}%`)
                        .limit(30)
                      if (error) throw error
                      setPoItemResults(
                        (data || []).map((r) => ({
                          id: String(r.id),
                          model: (r.model as string | null) ?? null,
                          description: (r.description as string | null) ?? null,
                        }))
                      )
                    } catch (err) {
                      console.error(err)
                      alert(err instanceof Error ? err.message : 'Inventory search failed')
                    }
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Search items
                </button>
              </div>

              <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflow: 'auto' }}>
                {poItemResults.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gap: 6,
                      gridTemplateColumns: '1fr 120px',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{item.model || item.description || 'Item'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{item.description || 'No description'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={poSelectedItems[item.id]?.qty ?? '1'}
                        onChange={(e) => setPoSelectedItems((prev) => ({ ...prev, [item.id]: { qty: e.target.value } }))}
                        style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                      />
                      <button
                        onClick={() =>
                          setPoSelectedItems((prev) => {
                            const next = { ...prev }
                            if (next[item.id]) delete next[item.id]
                            else next[item.id] = { qty: '1' }
                            return next
                          })
                        }
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: poSelectedItems[item.id] ? 'var(--accent)' : 'var(--panel)',
                          color: poSelectedItems[item.id] ? '#fff' : 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        {poSelectedItems[item.id] ? 'Remove' : 'Add'}
                      </button>
                    </div>
                  </div>
                ))}
                {!poItemResults.length ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>No inventory results yet.</div> : null}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input type="checkbox" checked={poManual} onChange={(e) => setPoManual(e.target.checked)} />
                <span style={{ fontSize: 12 }}>Item not in inventory (enter manually)</span>
              </div>
              {poManual ? (
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '1.4fr 0.4fr' }}>
                  <textarea
                    value={poManualDesc}
                    onChange={(e) => setPoManualDesc(e.target.value)}
                    placeholder="Description"
                    rows={3}
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={poManualQty}
                    onChange={(e) => setPoManualQty(e.target.value)}
                    placeholder="Qty"
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                  />
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Terms of purchase</label>
              <textarea
                value={poTerms}
                onChange={(e) => setPoTerms(e.target.value)}
                rows={3}
                placeholder="Payment terms, delivery notes, etc."
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPoModalOpen(false)}
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
                disabled={poCreating || !poSelectedSupplier}
                onClick={async () => {
                  if (!poSelectedSupplier) {
                    alert('Select a supplier first.')
                    return
                  }
                  const lines: Array<{ desc: string; qty: number }> = []
                  Object.entries(poSelectedItems).forEach(([id, meta]) => {
                    const found = poItemResults.find((i) => i.id === id)
                    lines.push({
                      desc: found?.description || found?.model || 'Item',
                      qty: meta.qty ? Number(meta.qty) || 1 : 1,
                    })
                  })
                  if (poManual && poManualDesc.trim()) {
                    lines.push({ desc: poManualDesc.trim(), qty: Number(poManualQty) || 1 })
                  }
                  setPoCreating(true)
                  try {
                    // Placeholder for actual PO creation.
                    alert(
                      `PO created (draft).\nSupplier: ${poSelectedSupplier.name}\nLines: ${lines.length}\nTerms: ${poTerms || 'n/a'}\nNext step: send via email or download.`
                    )
                    setPoModalOpen(false)
                  } catch (err) {
                    console.error(err)
                    alert(err instanceof Error ? err.message : 'Failed to create PO')
                  } finally {
                    setPoCreating(false)
                  }
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: poSelectedSupplier ? 'var(--accent)' : 'var(--panel)',
                  color: poSelectedSupplier ? '#fff' : 'var(--text)',
                  fontWeight: 900,
                  cursor: poSelectedSupplier ? 'pointer' : 'not-allowed',
                }}
              >
                Create PO
              </button>
              <button
                onClick={() => {
                  alert('Send directly to supplier (opens Outlook) - coming soon.')
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Send directly to supplier
              </button>
              <button
                onClick={() => alert('Download PO - coming soon.')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Download PO
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
