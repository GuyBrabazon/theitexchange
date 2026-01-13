'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type UserRow = {
  id: string
  role: string | null
  name: string | null
  company: string | null
  phone: string | null
  created_at: string | null
}

export default function ManageUsersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<UserRow[]>([])
  const [tenantId, setTenantId] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('broker')
  const [success, setSuccess] = useState('')
  const roleOptions = ['admin', 'finance', 'ops', 'broker', 'readonly']

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')
        await ensureProfile()

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        let tenant: string | null = null
        let role: string | null = null
        const { data: userRow } = await supabase.from('users').select('tenant_id,role').eq('id', user.id).maybeSingle()
        if (userRow) {
          tenant = (userRow as { tenant_id: string | null }).tenant_id
          role = (userRow as { role: string | null }).role
        } else {
          const { data: profRow } = await supabase.from('profiles').select('tenant_id,role').eq('id', user.id).maybeSingle()
          tenant = (profRow as { tenant_id?: string | null } | null)?.tenant_id ?? null
          role = (profRow as { role?: string | null } | null)?.role ?? null
        }

        if (!tenant) throw new Error('Tenant not found for this user')

        const admin = role === 'admin'
        setIsAdmin(admin)
        setTenantId(tenant)
        if (!admin) {
          setError('You do not have permission to view this page.')
          return
        }

        const { data, error } = await supabase
          .from('users')
          .select('id,role,name,company,phone,created_at')
          .eq('tenant_id', tenant)
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) throw error
        setRows((data ?? []) as UserRow[])
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load users')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const refreshUsers = async (tenant: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id,role,name,company,phone,created_at')
      .eq('tenant_id', tenant)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    setRows((data ?? []) as UserRow[])
  }

  const onInvite = async () => {
    if (!isAdmin) return
    setError('')
    setSuccess('')
    const email = inviteEmail.trim()
    if (!email) {
      setError('Enter an email to send an invite.')
      return
    }

    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.message || 'Invite failed')
      }
      setSuccess('Invite sent via auth provider. User will appear after signup.')
      setInviteEmail('')
      if (tenantId) {
        await refreshUsers(tenantId)
      }
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Invite failed')
    }
  }

  const onEdit = (id: string) => {
    alert(`Edit user ${id} (not yet implemented).`)
  }

  const onDelete = (id: string) => {
    alert(`Delete user ${id} (not yet implemented).`)
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>User Management</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Manage users for this organisation</div>
          {tenantId ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Tenant: {tenantId}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="Invitee email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 220 }}
            disabled={!isAdmin}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
            disabled={!isAdmin}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={onInvite}
            disabled={!isAdmin}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: isAdmin ? 'pointer' : 'not-allowed',
            }}
          >
            Send invite
          </button>
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
      {error ? <div style={{ color: 'var(--bad)' }}>{error}</div> : null}
      {success ? <div style={{ color: 'var(--good)' }}>{success}</div> : null}

      {!loading && !error ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: 10 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Role</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Company</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Created</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, color: 'var(--muted)' }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 10 }}>{r.name || '—'}</td>
                    <td style={{ padding: 10 }}>{r.role || '—'}</td>
                    <td style={{ padding: 10 }}>{r.company || '—'}</td>
                    <td style={{ padding: 10 }}>{r.phone || '—'}</td>
                    <td style={{ padding: 10 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onEdit(r.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--panel)',
                          cursor: isAdmin ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!isAdmin}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(r.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--panel)',
                          cursor: isAdmin ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!isAdmin}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  )
}
