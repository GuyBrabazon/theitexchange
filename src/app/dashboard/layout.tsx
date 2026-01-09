'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type NavItemDef = {
  href: string
  label: string
  importance?: 'primary' | 'normal' | 'quiet'
  soon?: boolean
  icon?: React.ReactNode
}

function NavItem({ href, label, importance = 'normal', soon = false, icon }: NavItemDef) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')

  const baseBg = active ? 'var(--accent-soft)' : 'transparent'
  const border = active ? 'var(--border)' : 'var(--border)'
  const text = active ? 'var(--text)' : 'var(--muted)'
  const fontWeight = importance === 'primary' ? 950 : importance === 'quiet' ? 750 : 900

  const iconDot =
    importance === 'primary'
      ? 'var(--accent)'
      : importance === 'quiet'
        ? 'var(--muted)'
        : 'var(--accent-2)'

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 12,
        textDecoration: 'none',
        border: `1px solid ${border}`,
        background: baseBg,
        color: text,
        fontWeight,
        boxShadow: active ? '0 10px 20px rgba(0,0,0,0.25)' : 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon ? (
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
            {icon}
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: iconDot,
              boxShadow: active ? '0 0 0 4px rgba(245,174,109,0.10)' : 'none',
            }}
          />
        )}
        {label}
      </span>

      {soon ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 900,
            padding: '3px 8px',
            borderRadius: 999,
            border: '1px solid rgba(245,174,109,0.22)',
            background: 'rgba(245,174,109,0.10)',
            color: 'rgba(247,242,236,0.85)',
            whiteSpace: 'nowrap',
          }}
        >
          Soon
        </span>
      ) : null}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'rgba(247,242,236,0.62)',
          marginBottom: 8,
          paddingLeft: 6,
          fontWeight: 900,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

type NotificationRow = {
  id: string
  tenant_id: string | null
  user_id: string | null
  kind: string | null
  title: string | null
  body: string | null
  created_at: string
  read_at: string | null
}

function fmtWhen(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [email, setEmail] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [tenantId, setTenantId] = useState<string>('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotificationRow[]>([])
  const [notifError, setNotifError] = useState<string>('')
  const bellWrapRef = useRef<HTMLDivElement | null>(null)

  const unreadCount = useMemo(() => notifs.filter((n) => !n.read_at).length, [notifs])

  const loadNotifications = async () => {
    if (!userId || !tenantId) return
    setNotifError('')
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,tenant_id,user_id,kind,title,body,created_at,read_at')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(25)

      if (error) throw error
      setNotifs((data as NotificationRow[]) || [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load notifications'
      setNotifError(msg)
    }
  }

  const markAllRead = async () => {
    if (!userId || !tenantId) return
    try {
      const ids = notifs.filter((n) => !n.read_at).map((n) => n.id)
      if (!ids.length) return

      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: nowIso })
        .in('id', ids)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
      if (error) throw error

      setNotifs((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })))
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to mark read'
      alert(msg)
    }
  }

  const openNotif = async () => {
    const next = !notifOpen
    setNotifOpen(next)
    if (next) await loadNotifications()
  }

  useEffect(() => {
    const run = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        const user = data.user
        if (!user) {
          router.replace('/login')
          return
        }

        setUserId(user.id)
        setEmail(user.email ?? '')

        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profileErr) throw profileErr
        if (!profile?.tenant_id) {
          throw new Error('Tenant not found for user')
        }

        setTenantId(profile.tenant_id)
      } catch (e) {
        console.error(e)
        router.replace('/login')
      } finally {
        setCheckingAuth(false)
      }
    }
    run()
  }, [router])

  // Close notifications on outside click / escape
  useEffect(() => {
    if (!notifOpen) return

    const onDown = (e: MouseEvent) => {
      const el = bellWrapRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setNotifOpen(false)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false)
    }

    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [notifOpen])

  // Theme handling
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light'
    setTheme(initial as 'light' | 'dark')
  }, [])

  useEffect(() => {
    if (!theme) return
    document.documentElement.setAttribute('data-theme', theme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme)
    }
  }, [theme])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const showSidebar = useMemo(() => pathname?.startsWith('/dashboard'), [pathname])
  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        Checking your session...
      </div>
    )
  }

  if (!showSidebar) return <>{children}</>

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <aside
        style={{
          width: 300,
          padding: 16,
          borderRight: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(245,174,109,0.06) 0%, rgba(10,9,7,0.0) 60%)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'visible',
        }}
      >
        {/* Brand + bell */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              aria-hidden
              style={{
                width: 34,
                height: 34,
                borderRadius: 14,
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                boxShadow: '0 12px 26px rgba(228,102,9,0.20)',
                flex: '0 0 auto',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 16, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
                The IT Exchange
              </div>
              <div
                style={{
                  marginTop: 2,
                  color: 'rgba(247,242,236,0.62)',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {email || '—'}
              </div>
            </div>
          </div>

          {/* Bell */}
          <div ref={bellWrapRef} style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              onClick={openNotif}
              title="Notifications"
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.18)',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M15 17H9m10-5V11a7 7 0 10-14 0v1c0 1.8-.6 3.4-1.6 4.6-.3.4 0 1 .6 1h16c.6 0 .9-.6.6-1C19.6 15.4 19 13.8 19 12z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>

              {unreadCount > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    border: '1px solid rgba(0,0,0,0.35)',
                    background: 'var(--accent)',
                    color: '#0a0907',
                    fontSize: 11,
                    fontWeight: 950,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 18px rgba(0,0,0,0.25)',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {/* Popover: open to the RIGHT (towards main content) */}
            {notifOpen ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  left: 0, // KEY: opens rightwards instead of leftwards
                  width: 'min(420px, calc(100vw - 320px - 24px))', // viewport minus sidebar (~300) minus padding
                  maxWidth: 'calc(100vw - 320px - 24px)',
                  maxHeight: 'min(70vh, 520px)',
                  overflow: 'hidden',
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'rgba(10,9,7,0.92)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                  zIndex: 50,
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: 12,
                    borderBottom: '1px solid rgba(247,242,236,0.10)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 950, letterSpacing: -0.1 }}>Notifications</div>
                    <div style={{ fontSize: 12, color: 'rgba(247,242,236,0.62)', marginTop: 2 }}>
                      {unreadCount ? `${unreadCount} unread` : 'All caught up'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={markAllRead}
                      disabled={!unreadCount}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(247,242,236,0.12)',
                        background: unreadCount ? 'rgba(245,174,109,0.10)' : 'rgba(0,0,0,0.18)',
                        color: 'rgba(247,242,236,0.92)',
                        fontWeight: 900,
                        cursor: unreadCount ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Mark all read
                    </button>

                    <button
                      onClick={() => setNotifOpen(false)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        border: '1px solid rgba(247,242,236,0.12)',
                        background: 'rgba(0,0,0,0.18)',
                        color: 'rgba(247,242,236,0.92)',
                        cursor: 'pointer',
                      }}
                      aria-label="Close notifications"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ maxHeight: 'min(70vh, 520px)', overflowY: 'auto', padding: 10 }}>
                  {notifError ? <div style={{ color: 'crimson', padding: 10 }}>{notifError}</div> : null}

                  {!notifError && notifs.length === 0 ? (
                    <div style={{ color: 'rgba(247,242,236,0.62)', padding: 10 }}>
                      Nothing yet. As orders move through the workflow, updates will appear here.
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {notifs.map((n) => {
                      const isUnread = !n.read_at
                      return (
                        <div
                          key={n.id}
                          style={{
                            borderRadius: 14,
                            border: `1px solid ${isUnread ? 'rgba(245,174,109,0.22)' : 'rgba(247,242,236,0.10)'}`,
                            background: isUnread ? 'rgba(245,174,109,0.08)' : 'rgba(0,0,0,0.10)',
                            padding: 10,
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                            <div style={{ fontWeight: 950, color: 'rgba(247,242,236,0.95)' }}>
                              {n.title ?? n.kind ?? 'Update'}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(247,242,236,0.58)', whiteSpace: 'nowrap' }}>
                              {fmtWhen(n.created_at)}
                            </div>
                          </div>

                          {n.body ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(247,242,236,0.72)', lineHeight: 1.35 }}>
                              {n.body}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Groups */}
        <Section title="General">
          <NavItem href="/dashboard" label="Home" importance="primary" icon="🏠" />
          <NavItem href="/dashboard/account" label="My Account" importance="normal" icon="👤" />
          <NavItem href="/dashboard/inventory" label="Inventory" importance="normal" icon="📦" />
        </Section>

        <Section title="Intelligence">
          <NavItem href="/dashboard/analytics" label="Analytics" importance="primary" icon="📊" />
          <NavItem href="/dashboard/reports" label="Reports" importance="normal" icon="📑" />
        </Section>

        <Section title="Sales">
          <NavItem href="/dashboard/lots" label="Auctions" importance="primary" icon="🎯" />
          <NavItem href="/dashboard/quoting" label="Quoting" importance="normal" icon="✉️" />
          <NavItem href="/dashboard/buyers" label="Customers" importance="normal" icon="👥" />
        </Section>

        <Section title="Buying">
          <NavItem href="/dashboard/buy" label="Buy" importance="normal" icon="🛒" />
          <NavItem href="/dashboard/sellers" label="Suppliers" importance="normal" icon="🏭" />
        </Section>

        <Section title="Logistics">
          <NavItem href="/dashboard/order-fulfilment" label="Order fulfilment" importance="primary" icon="🚚" />
          <NavItem href="/dashboard/fulfilment" label="Warehouse" importance="normal" icon="🏢" />
        </Section>

        {/* Footer actions */}
        <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          <button
            onClick={signOut}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>

          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            Tip: “Primary” items are highlighted for faster daily navigation.
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}
