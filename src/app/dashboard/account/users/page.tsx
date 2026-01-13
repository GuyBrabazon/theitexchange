'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()

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

        // Pull tenant/role from users (primary), fallback to profiles
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

  const onAddUser = () => {
    alert('To add a user, send them your signup link or invite through your auth flow. (Admin-only action)')
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
        <button
          onClick={onAddUser}
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
          Add user
        </button>
      </div>

      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
      {error ? <div style={{ color: 'var(--bad)' }}>{error}</div> : null}

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
