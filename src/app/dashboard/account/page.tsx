'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type UserRow = {
  id: string
  tenant_id: string | null
  role: string | null
  name: string | null
  company: string | null
  phone: string | null
  created_at: string | null
  updated_at: string | null
}

async function copyText(v: string) {
  try {
    await navigator.clipboard.writeText(v)
    alert('Copied to clipboard.')
  } catch {
    alert('Copy failed (browser permissions).')
  }
}

export default function AccountPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [authId, setAuthId] = useState<string>('')
  const [authEmail, setAuthEmail] = useState<string>('')

  const [row, setRow] = useState<UserRow | null>(null)

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [outlookStatus, setOutlookStatus] = useState('Not connected')
  const [outlookBusy, setOutlookBusy] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        await ensureProfile()

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) throw new Error('Not authenticated')

        setAuthId(user.id)
        setAuthEmail(user.email ?? '')

        const { data, error } = await supabase
          .from('users')
          .select('id,tenant_id,role,name,company,phone,created_at,updated_at')
          .eq('id', user.id)
          .maybeSingle()

        if (error) throw error

        if (data) {
          setRow(data)
          setName(data.name ?? '')
          setCompany(data.company ?? '')
          setPhone(data.phone ?? '')
        }

        // Check Outlook status
        const statusRes = await fetch(`/api/outlook/status?uid=${user.id}`)
        if (statusRes.ok) {
          const json = (await statusRes.json()) as { ok: boolean; connected?: boolean; expires_at?: string; message?: string }
          if (json.ok && json.connected) {
            setOutlookStatus('Connected')
          } else if (json.ok) {
            setOutlookStatus('Not connected')
          } else {
            setOutlookStatus(json.message ?? 'Status check failed')
          }
        }
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load account'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const save = async () => {
    if (!authId) return
    try {
      setSaving(true)
      setError('')

      const { error } = await supabase
        .from('users')
        .upsert(
          {
            id: authId,
            name: name || null,
            company: company || null,
            phone: phone || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )

      if (error) throw error

      alert('Account updated.')
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
        <h1>My Account</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 6 }}>My Account</h1>
      <div style={{ color: 'var(--muted)', marginBottom: 16 }}>
        Manage your personal profile
      </div>

      {error ? (
        <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>
      ) : null}

      {/* Identity */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: 'var(--panel)',
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Identity</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            User ID:{' '}
            <b style={{ color: 'var(--text)' }}>
              {authId || '—'}
            </b>
          </div>
          {authId ? (
            <button
              onClick={() => copyText(authId)}
              style={{
                padding: '6px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
              }}
            >
              Copy
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            Tenant ID:{' '}
            <b style={{ color: 'var(--text)' }}>
              {row?.tenant_id ?? '—'}
            </b>
          </div>
          {row?.tenant_id ? (
            <button
            onClick={() => copyText(row.tenant_id!)}
            style={{
                padding: '6px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
            }}
            >
            Copy
            </button>
          ) : null}
        </div>

        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
          Email (auth): <b>{authEmail || '—'}</b>
        </div>
      </div>

      {/* Outlook */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: 'var(--panel)',
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Outlook connection</div>
        <div style={{ color: 'var(--muted)', marginBottom: 10, fontSize: 12 }}>
          Connect Outlook to send invites directly from your mailbox and enable future inbox processing.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (!authId) {
                alert('User not loaded yet')
                return
              }
              window.location.href = `/api/outlook/authorize?uid=${authId}`
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Connect Outlook
          </button>
          <button
            onClick={async () => {
              setOutlookBusy(true)
              try {
                const res = await fetch(`/api/outlook/send-test?uid=${authId}`, { method: 'POST' })
                const json = await res.json()
                if (!res.ok || !json.ok) throw new Error(json.message || 'Failed')
                setOutlookStatus('Test email sent')
              } catch (e) {
                console.error(e)
                setOutlookStatus('Test failed')
                alert(e instanceof Error ? e.message : 'Test failed')
              } finally {
                setOutlookBusy(false)
              }
            }}
            disabled={outlookBusy}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: outlookBusy ? 'wait' : 'pointer',
            }}
          >
            Send test email
          </button>
          <button
            onClick={async () => {
              setOutlookBusy(true)
              try {
                const res = await fetch('/api/outlook/disconnect', { method: 'POST' })
                const json = await res.json()
                if (!res.ok || !json.ok) throw new Error(json.message || 'Failed')
                setOutlookStatus('Disconnected')
              } catch (e) {
                console.error(e)
                alert(e instanceof Error ? e.message : 'Failed to disconnect')
              } finally {
                setOutlookBusy(false)
              }
            }}
            disabled={outlookBusy}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: outlookBusy ? 'wait' : 'pointer',
            }}
          >
            Disconnect
          </button>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{outlookStatus}</div>
        </div>
      </div>

      {/* Profile */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: 'var(--panel)',
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: 12 }}>Profile</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '10px 14px',
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
      </div>
    </main>
  )
}
