import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // If there's a code or token_hash parameter at root, redirect to auth callback
  // This handles both PKCE flow (code) and email confirmation links (token_hash)
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('token_hash'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    // All search params (code, token_hash, type, next, etc.) are preserved automatically
    return NextResponse.redirect(url)
  }

  // Handle error parameters at root (redirect to auth error page)
  if (pathname === '/' && searchParams.has('error')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/auth-error'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
