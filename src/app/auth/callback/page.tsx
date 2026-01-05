'use client'

import { Suspense, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'

// Prevent Next from trying to prerender this page at build time (needs Supabase env at runtime)
export const dynamic = 'force-dynamic'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const finishLogin = async () => {
      const code = searchParams.get('code')
      try {
        if (code) {
          // Magic link / PKCE flow: exchange code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // Fallback: ensure we have a session (e.g., already logged in)
          const { data, error } = await supabase.auth.getSession()
          if (error || !data.session) throw error ?? new Error('No session found')
        }
        router.replace('/dashboard')
        // hard navigate as a fallback to avoid loops
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard'
        }
      } catch (err) {
        console.error('Auth callback failed', err)
        router.replace('/login?error=auth_callback')
      }
    }

    finishLogin()
  }, [router, searchParams])

  return <p>Logging you in...</p>
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<p>Logging you in...</p>}>
      <AuthCallbackInner />
    </Suspense>
  )
}
