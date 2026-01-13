'use client'

import { useEffect } from 'react'
import { redirect } from 'next/navigation'

export default function SignInRedirect() {
  useEffect(() => {
    redirect('/login')
  }, [])
  return null
}
