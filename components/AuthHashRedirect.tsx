'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * This component detects Supabase auth hash fragments in the URL
 * and redirects to /auth/callback to process them.
 *
 * Hash fragments (#access_token=xxx) are NOT sent to the server,
 * so we need client-side detection.
 */
export default function AuthHashRedirect() {
  const router = useRouter()

  useEffect(() => {
    // Check if URL has hash fragment with auth tokens
    const hash = window.location.hash

    if (hash && hash.length > 1) {
      const hashParams = new URLSearchParams(hash.substring(1))

      // Check for Supabase auth tokens or errors
      const hasAuthTokens = hashParams.has('access_token') ||
                           hashParams.has('error') ||
                           hashParams.has('token_hash')

      if (hasAuthTokens) {
        // Redirect to auth callback with the hash intact
        // The callback page will read the hash and process it
        router.push(`/auth/callback${hash}`)
      }
    }

    // Also check for query params that should go to callback
    const searchParams = new URLSearchParams(window.location.search)
    const hasAuthParams = searchParams.has('code') ||
                         searchParams.has('token_hash') ||
                         searchParams.has('error')

    if (hasAuthParams) {
      router.push(`/auth/callback${window.location.search}`)
    }
  }, [router])

  // This component doesn't render anything
  return null
}
