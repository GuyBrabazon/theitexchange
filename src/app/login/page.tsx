'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleLogin = async () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || location.origin
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    })

    if (!error) setSent(true)
    else alert(error.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-96 space-y-4">
        <h1 className="text-2xl font-bold">The IT Exchange</h1>

        {sent ? (
          <p>Check your email for the login link.</p>
        ) : (
          <>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border p-2"
            />
            <button onClick={handleLogin} className="w-full bg-black text-white p-2">
              Send link
            </button>
          </>
        )}
      </div>
    </div>
  )
}
