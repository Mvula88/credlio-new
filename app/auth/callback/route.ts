import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Handle password reset - redirect to the appropriate reset password page
      if (type === 'recovery') {
        // Use the next parameter if provided, otherwise default to lender
        const resetPage = next.includes('/b/') ? '/b/reset-password' : '/l/reset-password'
        return NextResponse.redirect(`${origin}${resetPage}`)
      }

      // Handle email confirmation or other auth flows
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-error`)
}
