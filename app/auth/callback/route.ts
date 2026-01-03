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

  // Handle code exchange (PKCE flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Handle password reset - redirect to the appropriate reset password page
      if (type === 'recovery') {
        const resetPage = next.includes('/b/') ? '/b/reset-password' : '/l/reset-password'
        return NextResponse.redirect(`${origin}${resetPage}`)
      }

      // Handle email confirmation or other auth flows
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle token_hash verification (email confirmation links)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type,
      token_hash: token_hash,
    })

    if (!error) {
      // Successfully verified - redirect to appropriate page
      if (type === 'signup' || type === 'email') {
        // Email confirmed - redirect to next or default page
        return NextResponse.redirect(`${origin}${next}`)
      }
      if (type === 'recovery') {
        const resetPage = next.includes('/b/') ? '/b/reset-password' : '/l/reset-password'
        return NextResponse.redirect(`${origin}${resetPage}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-error`)
}
