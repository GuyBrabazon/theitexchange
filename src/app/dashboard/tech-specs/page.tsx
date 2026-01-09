'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type RuleRow = {
  id: string
  system_model: string
  component_tag: string
  note: string | null
  scope: 'global' | 'tenant'
}

export default function TechSpecsPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [sysModel, setSysModel] = useState('')
  const [compTag, setCompTag] = useState('')
  const [note, setNote] = useState('')
  const [scope, setScope] = useState<'global' | 'tenant'>('tenant')

  const [checkModel, setCheckModel] = useState('')
  const [checkTag, setCheckTag] = useState('')
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const [recentRules, setRecentRules] = useState<RuleRow[]>([])

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        const user = data.user
        if (!user) throw new Error('Not signed in')
        const { data: profile, error: profileErr } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
        if (profileErr) throw profileErr
        if (!profile?.tenant_id) throw new Error('Tenant not found')
        setTenantId(profile.tenant_id)
        await loadRules(profile.tenant_id)
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load'
        setError(msg)
      }
    }
    loadUser()
  }, [])

  const loadRules = async (tid: string) => {
    try {
      const [globalRes, tenantRes] = await Promise.all([
        supabase.from('compat_rules_global').select('id,system_model,component_tag,note').order('created_at', { ascending: false }).limit(10),
        supabase
          .from('compat_rules')
          .select('id,system_model,component_tag,note')
          .eq('tenant_id', tid)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      const rows: RuleRow[] = []
      for (const r of globalRes.data ?? []) {
        rows.push({ id: r.id, system_model: r.system_model, component_tag: r.component_tag, note: r.note ?? null, scope: 'global' })
      }
      for (const r of tenantRes.data ?? []) {
        rows.push({ id: r.id, system_model: r.system_model, component_tag: r.component_tag, note: r.note ?? null, scope: 'tenant' })
      }
      rows.sort((a, b) => a.system_model.localeCompare(b.system_model))
      setRecentRules(rows.slice(0, 20))
    } catch (e) {
      console.error(e)
    }
  }

  const addRule = async () => {
    if (!sysModel.trim() || !compTag.trim()) {
      setError('System model and component tag are required')
      return
    }
    try {
      setLoading(true)
      setError('')
      if (scope === 'global') {
        const { error } = await supabase
          .from('compat_rules_global')
          .insert({ system_model: sysModel.trim(), component_tag: compTag.trim(), note: note || null })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('compat_rules')
          .insert({ tenant_id: tenantId, system_model: sysModel.trim(), component_tag: compTag.trim(), note: note || null })
        if (error) throw error
      }
      setSysModel('')
      setCompTag('')
      setNote('')
      await loadRules(tenantId)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to add rule'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const checkCompat = async () => {
    if (!checkModel.trim() || !checkTag.trim()) {
      setCheckResult('Enter system model and component tag to check.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const query = `
        with rules as (
          select system_model, component_tag from compat_rules_global
          union
          select system_model, component_tag from compat_rules where tenant_id = ?
        )
        select 1 from rules where system_model = ? and component_tag = ? limit 1;
      `
      // Supabase JS does not support positional params for sql strings; emulate with two calls
      const { data: globalMatch, error: gErr } = await supabase
        .from('compat_rules_global')
        .select('id')
        .eq('system_model', checkModel.trim())
        .eq('component_tag', checkTag.trim())
        .limit(1)
      if (gErr) throw gErr
      const { data: tenantMatch, error: tErr } = await supabase
        .from('compat_rules')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('system_model', checkModel.trim())
        .eq('component_tag', checkTag.trim())
        .limit(1)
      if (tErr) throw tErr

      const ok = (globalMatch?.length ?? 0) > 0 || (tenantMatch?.length ?? 0) > 0
      setCheckResult(ok ? 'Compatible: rule exists.' : 'No compatibility rule found.')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Check failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Tech Specs</h1>
        <div style={{ color: 'var(--muted)' }}>Create and check compatibility relationships between systems and parts.</div>
      </div>

      {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--panel)', display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Create relationship</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>System model</span>
            <input
              value={sysModel}
              onChange={(e) => setSysModel(e.target.value)}
              placeholder="e.g., Dell R740"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Component tag</span>
            <input
              value={compTag}
              onChange={(e) => setCompTag(e.target.value)}
              placeholder="e.g., ram_ddr4_16gb"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any extra context"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
              <input
                type="radio"
                name="scope"
                value="tenant"
                checked={scope === 'tenant'}
                onChange={() => setScope('tenant')}
              />
              Tenant only
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
              <input
                type="radio"
                name="scope"
                value="global"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              Global (shared)
            </label>
          </div>
          <button
            onClick={addRule}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 900,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Save rule'}
          </button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--panel)', display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Check compatibility</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>System model</span>
            <input
              value={checkModel}
              onChange={(e) => setCheckModel(e.target.value)}
              placeholder="e.g., Dell R740"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Component tag</span>
            <input
              value={checkTag}
              onChange={(e) => setCheckTag(e.target.value)}
              placeholder="e.g., ram_ddr4_16gb"
              style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)' }}
            />
          </label>
          <button
            onClick={checkCompat}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Check'}
          </button>
          {checkResult ? <div style={{ color: checkResult.includes('Compatible') ? '#10b981' : 'var(--muted)' }}>{checkResult}</div> : null}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--panel)' }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Recent rules (global + tenant)</div>
        {recentRules.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No rules yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recentRules.map((r) => (
              <div
                key={r.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 10,
                  background: 'var(--panel-2)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {r.system_model} → {r.component_tag}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Scope: {r.scope === 'global' ? 'Global' : 'Tenant'} {r.note ? `• ${r.note}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
