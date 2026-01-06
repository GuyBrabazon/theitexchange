'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'
import { parseSpreadsheetMatrix } from '@/lib/parseSpreadsheet'


type BuyerRow = Record<string, unknown>
type BuyerInsert = {
  tenant_id: string
  name: string
  email: string | null
  email_norm: string | null
  company: string | null
  tags: string[] | null
  credit_ok: boolean | null
  payment_terms: string | null
  reliability_score: number | null
  is_active: boolean | null
  do_not_invite: boolean | null
}

type SheetMatrix = {
  rows: unknown[][]
}

type FieldKey =
  | 'name'
  | 'email'
  | 'company'
  | 'tags'
  | 'credit_ok'
  | 'payment_terms'
  | 'reliability_score'
  | 'is_active'
  | 'do_not_invite'

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name (required)',
  email: 'Email (dedupe key)',
  company: 'Company',
  tags: 'Tags (comma/semicolon separated)',
  credit_ok: 'Credit OK',
  payment_terms: 'Payment terms',
  reliability_score: 'Reliability score (1-5)',
  is_active: 'Active',
  do_not_invite: 'Do not invite',
}

function parseTags(val: unknown): string[] | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  return s
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean)
}

function parseBool(val: unknown): boolean | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim().toLowerCase()
  if (!s) return null
  if (['1', 'true', 't', 'yes', 'y', 'ok'].includes(s)) return true
  if (['0', 'false', 'f', 'no', 'n', 'flag'].includes(s)) return false
  return null
}

function parseReliability(val: unknown): number | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 1 || rounded > 5) return null
  return rounded
}

function normalizeEmail(val: unknown): string | null {
  const s = String(val ?? '').trim()
  if (!s) return null
  return s.toLowerCase()
}

function pickColumn(row: BuyerRow, col: string | null | undefined) {
  if (!col) return null
  return row[col]
}

export default function BuyersImportPage() {
  const [tenantId, setTenantId] = useState('')

  // Spreadsheet parsing
  const [sheet, setSheet] = useState<SheetMatrix | null>(null)
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0)

  // derived columns + rows
  const columns = useMemo<string[]>(() => {
    if (!sheet) return []
    const rows = sheet.rows ?? []
    const header: unknown[] = Array.isArray(rows[headerRowIndex]) ? (rows[headerRowIndex] as unknown[]) : []
    return header.map((h: unknown, i: number) => (String(h ?? '').trim() ? String(h).trim() : `Column ${i + 1}`))
  }, [sheet, headerRowIndex])

  const dataRows = useMemo(() => {
    if (!sheet) return []
    const rows = sheet.rows ?? []
    const header: unknown[] = Array.isArray(rows[headerRowIndex]) ? (rows[headerRowIndex] as unknown[]) : []
    const out: BuyerRow[] = []

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const raw = rows[r]
      if (!Array.isArray(raw)) continue
      const row = raw as unknown[]
      // skip fully empty rows
      const hasAny = row.some((v: unknown) => String(v ?? '').trim() !== '')
      if (!hasAny) continue

      const obj: BuyerRow = {}
      for (let c = 0; c < header.length; c++) {
        const key = columns[c] ?? `Column ${c + 1}`
        obj[key] = row[c]
      }
      out.push(obj)
    }

    return out
  }, [sheet, headerRowIndex, columns])

  // mapping: field -> column name
  const [mapping, setMapping] = useState<Record<FieldKey, string | ''>>({
    name: '',
    email: '',
    company: '',
    tags: '',
    credit_ok: '',
    payment_terms: '',
    reliability_score: '',
    is_active: '',
    do_not_invite: '',
  })

  // suggestions: try to auto-map based on column names
  useEffect(() => {
    if (!columns.length) return
    const lowerCols = columns.map((c) => c.toLowerCase())

    const guess = (patterns: string[]) => {
      for (let i = 0; i < lowerCols.length; i++) {
        if (patterns.some((p) => lowerCols[i].includes(p))) return columns[i]
      }
      return ''
    }

    setMapping((prev) => ({
      ...prev,
      name: prev.name || guess(['name', 'buyer name', 'contact']),
      email: prev.email || guess(['email', 'e-mail']),
      company: prev.company || guess(['company', 'organisation', 'organization', 'org']),
      tags: prev.tags || guess(['tags', 'tag', 'categories', 'category']),
      credit_ok: prev.credit_ok || guess(['credit', 'credit ok', 'credit_ok']),
      payment_terms: prev.payment_terms || guess(['terms', 'payment', 'net']),
      reliability_score: prev.reliability_score || guess(['reliability', 'score', 'rating']),
      is_active: prev.is_active || guess(['active', 'enabled']),
      do_not_invite: prev.do_not_invite || guess(['do not invite', 'dni', 'block', 'blocked']),
    }))
  }, [columns])

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null)
  const downloadTemplate = async () => {
    setResult(null)
    try {
      const res = await fetch('/api/buyers-template')
      if (!res.ok) throw new Error('Failed to generate buyer template')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'buyer_import_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Download failed'
      alert(msg)
    }
  }

  useEffect(() => {
    const init = async () => {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)
    }
    init()
      .catch((e) => {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to init'
        alert(msg)
      })
  }, [])

  const onFile = async (file: File) => {
    setResult(null)

    // parseSpreadsheetMatrix is your actual export
    const parsed = await parseSpreadsheetMatrix(file)

    // Normalize different parser output shapes -> rows: any[][]
    const rowsCandidate =
      (parsed as { rows?: unknown })?.rows ??
      (parsed as { sheet?: { rows?: unknown } })?.sheet?.rows ??
      (parsed as { data?: { rows?: unknown } })?.data?.rows ??
      (parsed as { sheets?: Array<{ rows?: unknown }> })?.sheets?.[0]?.rows ??
      (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object' ? (parsed[0] as { rows?: unknown }).rows : null) ??
      (Array.isArray(parsed) ? parsed : null)

    const rows = Array.isArray(rowsCandidate) ? (rowsCandidate as unknown[][]) : null

    if (!rows) {
      console.log('parseSpreadsheetMatrix output:', parsed)
      alert('Spreadsheet parsed, but returned an unexpected structure. Check console log.')
      setSheet(null)
      return
    }

    // Safety: ensure rows is a 2D matrix
    const matrix = rows.map((r) => (Array.isArray(r) ? r : [r]))

    setSheet({ rows: matrix })
    setHeaderRowIndex(0)
  }

  const buildBuyerRecords = () => {
    const nameCol = mapping.name || null
    const emailCol = mapping.email || null

    if (!nameCol) throw new Error('Map “Name” before importing.')

    const recordsWithEmail: BuyerInsert[] = []
    const recordsNoEmail: BuyerInsert[] = []

    for (const row of dataRows) {
      const name = String(pickColumn(row, nameCol) ?? '').trim()
      if (!name) continue

      const emailRaw = emailCol ? pickColumn(row, emailCol) : null
      const email = normalizeEmail(emailRaw)

      const company = mapping.company ? String(pickColumn(row, mapping.company) ?? '').trim() || null : null
      const tags = mapping.tags ? parseTags(pickColumn(row, mapping.tags)) : null

      const credit_ok = mapping.credit_ok ? parseBool(pickColumn(row, mapping.credit_ok)) : null
      const payment_terms = mapping.payment_terms
        ? String(pickColumn(row, mapping.payment_terms) ?? '').trim() || null
        : null
      const reliability_score = mapping.reliability_score
        ? parseReliability(pickColumn(row, mapping.reliability_score))
        : null

      const is_active = mapping.is_active ? parseBool(pickColumn(row, mapping.is_active)) : null
      const do_not_invite = mapping.do_not_invite ? parseBool(pickColumn(row, mapping.do_not_invite)) : null

      const base: BuyerInsert = {
        tenant_id: tenantId,
        name,
        email: email ? email : null,
        email_norm: email ? email : null,
        company,
        tags,
        credit_ok,
        payment_terms,
        reliability_score,
        is_active,
        do_not_invite,
      }

      if (email) recordsWithEmail.push(base)
      else recordsNoEmail.push(base)
    }

    return { recordsWithEmail, recordsNoEmail }
  }

  const importBuyers = async () => {
    if (!tenantId) return alert('Tenant not ready yet.')
    if (!sheet) return alert('Upload a file first.')
    if (!columns.length) return alert('No columns detected.')
    if (!dataRows.length) return alert('No data rows detected.')

    setBusy(true)
    setResult(null)

    try {
      const { recordsWithEmail, recordsNoEmail } = buildBuyerRecords()

      if (recordsWithEmail.length === 0 && recordsNoEmail.length === 0) {
        alert('Nothing to import (all rows empty or missing name).')
        return
      }

      // 1) Upsert rows WITH email (dedupe key)
      let upsertUpdatedOrInserted = 0
      if (recordsWithEmail.length) {
        const { error } = await supabase
          .from('buyers')
          .upsert(recordsWithEmail, { onConflict: 'tenant_id,email_norm' })

        if (error) throw error
        upsertUpdatedOrInserted = recordsWithEmail.length
      }

      // 2) Insert rows WITHOUT email (cannot dedupe reliably)
      let insertedNoEmail = 0
      if (recordsNoEmail.length) {
        // Optional: you can skip no-email rows if you prefer strict dedupe
        const { error } = await supabase.from('buyers').insert(recordsNoEmail)
        if (error) throw error
        insertedNoEmail = recordsNoEmail.length
      }

      // We can’t perfectly split inserted vs updated without extra queries.
      setResult({ inserted: insertedNoEmail, updated: upsertUpdatedOrInserted, skipped: 0 })
      alert('Import complete.')
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Import failed'
      alert(msg)
    } finally {
      setBusy(false)
    }
  }

  const preview = useMemo(() => dataRows.slice(0, 20), [dataRows])

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Import buyers</h1>
          <div style={{ color: '#666' }}>Upload CSV/XLSX, map columns, dedupe by email.</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard/buyers">← Buyers</Link>
        </div>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <h2>1) Upload</h2>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f).catch((err) => alert(err?.message ?? 'Failed to parse file'))
        }}
      />
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={downloadTemplate}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Download buyer template (XLSX)
        </button>
      </div>

      {sheet ? (
        <>
          <hr style={{ margin: '18px 0' }} />

          <h2>2) Header row</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ color: '#666' }}>Pick which row contains column names:</div>
            <select
              value={headerRowIndex}
              onChange={(e) => setHeaderRowIndex(Number(e.target.value))}
              style={{ padding: 8, border: '1px solid #ddd' }}
            >
              {(sheet.rows ?? []).slice(0, Math.min(10, (sheet.rows ?? []).length)).map((_, i) => (
                <option key={i} value={i}>
                  Row {i + 1}
                </option>
              ))}
            </select>
            <div style={{ color: '#666' }}>
              Columns detected: <b>{columns.length}</b> • Data rows: <b>{dataRows.length}</b>
            </div>
          </div>

          <hr style={{ margin: '18px 0' }} />

          <h2>3) Map columns</h2>
          <div style={{ color: '#666', marginTop: 6 }}>
            You only *must* map <b>Name</b>. Email is strongly recommended for dedupe.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10, marginTop: 12 }}>
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
              <div key={field} style={{ display: 'contents' }}>
                <div style={{ alignSelf: 'center', fontWeight: 700 }}>{FIELD_LABELS[field]}</div>
                <select
                  value={mapping[field]}
                  onChange={(e) => setMapping((p) => ({ ...p, [field]: e.target.value }))}
                  style={{ padding: 10, border: '1px solid #ddd', borderRadius: 10 }}
                >
                  <option value="">(not mapped)</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <hr style={{ margin: '18px 0' }} />

          <h2>4) Preview</h2>
          <div style={{ color: '#666', marginTop: 6 }}>First 20 rows from the file after the header row:</div>

          <div style={{ overflowX: 'auto', marginTop: 10, border: '1px solid #eee', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {columns.slice(0, 12).map((c) => (
                    <th key={c} style={{ textAlign: 'left', fontSize: 12, padding: 8, borderBottom: '1px solid #eee' }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={idx}>
                    {columns.slice(0, 12).map((c) => (
                      <td key={c} style={{ fontSize: 12, padding: 8, borderBottom: '1px solid #f2f2f2' }}>
                        {String(r[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <hr style={{ margin: '18px 0' }} />

          <h2>5) Import</h2>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <button onClick={importBuyers} disabled={busy} style={{ padding: 12 }}>
              {busy ? 'Importing…' : 'Import buyers'}
            </button>

            {result ? (
              <div style={{ color: '#666' }}>
                Imported: <b>{result.updated + result.inserted}</b> • Upserted (email): <b>{result.updated}</b> • Inserted (no email):{' '}
                <b>{result.inserted}</b>
              </div>
            ) : null}

            <div style={{ color: '#666' }}>Tenant: {tenantId ? 'loaded' : '—'}</div>
          </div>
        </>
      ) : null}
    </main>
  )
}

