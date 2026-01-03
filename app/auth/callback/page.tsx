'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Verifying your email...')

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient()

      // Check for hash fragment (Supabase uses this for email confirmations)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const hashError = hashParams.get('error')
      const hashErrorDescription = hashParams.get('error_description')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      // If there's an error in hash
      if (hashError) {
        router.push(`/auth/auth-error?error=${hashError}&error_description=${encodeURIComponent(hashErrorDescription || '')}`)
        return
      }

      // If we have tokens in hash (implicit flow / email confirmation)
      if (accessToken && refreshToken) {
        setStatus('Setting up your session...')
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (!error) {
          // Redirect based on type or user role
          await redirectBasedOnRole(supabase, type)
          return
        }
      }

      // Check for query params (PKCE flow)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const queryType = urlParams.get('type')
      const next = urlParams.get('next') || '/'
      const queryError = urlParams.get('error')

      if (queryError) {
        router.push(`/auth/auth-error?error=${queryError}`)
        return
      }

      // Handle code exchange (PKCE flow)
      if (code) {
        setStatus('Exchanging code for session...')
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
          // Handle recovery (password reset)
          if (queryType === 'recovery') {
            const resetPage = next.includes('/b/') ? '/b/reset-password' : '/l/reset-password'
            router.push(resetPage)
            return
          }

          // Use next param if provided, otherwise redirect based on role
          if (next !== '/') {
            router.push(next)
            return
          }

          await redirectBasedOnRole(supabase, queryType)
          return
        }
      }

      // Check for token_hash in query params
      const tokenHash = urlParams.get('token_hash')
      const tokenType = urlParams.get('type')

      if (tokenHash && tokenType) {
        setStatus('Verifying token...')
        const { error } = await supabase.auth.verifyOtp({
          type: tokenType as any,
          token_hash: tokenHash,
        })

        if (!error) {
          await redirectBasedOnRole(supabase, tokenType)
          return
        }
      }

      // If nothing worked, try to get current session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await redirectBasedOnRole(supabase, null)
        return
      }

      // If we reach here, something went wrong
      router.push('/auth/auth-error')
    }

    async function redirectBasedOnRole(supabase: ReturnType<typeof createClient>, type: string | null) {
      // Handle recovery type - go directly to reset password
      if (type === 'recovery') {
        router.push('/l/reset-password')
        return
      }

      // For email confirmation (signup type), show success page
      // This is more professional - user sees confirmation then signs in
      if (type === 'signup' || type === 'email') {
        // Get user role to customize the success page
        const { data: { user } } = await supabase.auth.getUser()
        let role = 'lender'

        if (user) {
          const appRole = user.user_metadata?.app_role
          if (appRole === 'borrower') {
            role = 'borrower'
          } else {
            // Check user_roles table
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', user.id)

            const userRoles = roles?.map((r: { role: string }) => r.role) || []
            if (userRoles.includes('borrower')) {
              role = 'borrower'
            }
          }
        }

        // Sign out so user has to sign in properly (cleaner flow)
        await supabase.auth.signOut()

        // Show success page with sign in link
        router.push(`/auth/email-confirmed?role=${role}`)
        return
      }

      // For other types, get user and redirect based on role
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Check user_roles table
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)

        const userRoles = roles?.map((r: { role: string }) => r.role) || []

        // Check app_role from metadata as fallback
        const appRole = user.user_metadata?.app_role

        if (userRoles.includes('borrower') || appRole === 'borrower') {
          // Check if onboarding is completed
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .single()

          if (profile?.onboarding_completed) {
            router.push('/b/overview')
          } else {
            router.push('/b/onboarding')
          }
          return
        }
        if (userRoles.includes('lender') || appRole === 'lender') {
          // Check if lender profile is completed
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .single()

          // Also check if lender record exists with required fields
          const { data: lender } = await supabase
            .from('lenders')
            .select('id, id_photo_url')
            .eq('user_id', user.id)
            .single()

          // If profile not completed or lender record missing/incomplete, go to complete-profile
          if (!profile?.onboarding_completed || !lender?.id_photo_url) {
            router.push('/l/complete-profile')
          } else {
            router.push('/l/overview')
          }
          return
        }

        // User exists but no role found - redirect to a selection page or login
        router.push('/l/login')
        return
      }

      // No user found - redirect to login
      router.push('/l/login')
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-gray-600">{status}</p>
    </div>
  )
}
