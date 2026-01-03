import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  const supabase = await createClient()

  // Helper function to determine redirect based on user role
  async function getRedirectUrl(defaultNext: string): Promise<string> {
    // If recovery type, redirect to reset password
    if (type === 'recovery') {
      return defaultNext.includes('/b/') ? '/b/reset-password' : '/l/reset-password'
    }

    // If specific next URL provided, use it
    if (defaultNext !== '/') {
      return defaultNext
    }

    // Otherwise, check user's role and redirect to appropriate dashboard
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

      const userRoles = roles?.map(r => r.role) || []

      // Check app_role from user metadata as fallback
      const appRole = user.user_metadata?.app_role

      if (userRoles.includes('borrower') || appRole === 'borrower') {
        return '/b/onboarding'
      }
      if (userRoles.includes('lender') || appRole === 'lender') {
        return '/l/overview'
      }
    }

    return defaultNext
  }

  // Handle code exchange (PKCE flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const redirectUrl = await getRedirectUrl(next)
      return NextResponse.redirect(`${origin}${redirectUrl}`)
    }
  }

  // Handle token_hash verification (email confirmation links)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type,
      token_hash: token_hash,
    })

    if (!error) {
      const redirectUrl = await getRedirectUrl(next)
      return NextResponse.redirect(`${origin}${redirectUrl}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-error`)
}
