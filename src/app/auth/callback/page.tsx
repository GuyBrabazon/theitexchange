'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Prevent Next from trying to prerender this page at build time (needs Supabase env at runtime)
export const dynamic = 'force-dynamic'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const finishLogin = async () => {
      await supabase.auth.getSession()
      router.push('/dashboard')
    }

    finishLogin()
  }, [router])

  return <p>Logging you in...</p>
}
