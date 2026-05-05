import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication
const protectedPrefixes = ['/l/', '/b/', '/admin/']

// Public routes within protected prefixes (login, register, etc.)
const publicRoutes = [
  '/l/login',
  '/l/register',
  '/l/register/confirm-email',
  '/l/forgot-password',
  '/l/reset-password',
  '/b/login',
  '/b/register',
  '/b/register/confirm-email',
  '/b/forgot-password',
  '/b/reset-password',
  '/b/verify',
]

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // If there's a code or token_hash parameter at root, redirect to auth callback
  // This handles both PKCE flow (code) and email confirmation links (token_hash)
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('token_hash'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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
  const { data: { user } } = await supabase.auth.getUser()

  // Check if this is a protected route
  const isProtectedRoute = protectedPrefixes.some(prefix => pathname.startsWith(prefix))
  const isPublicRoute = publicRoutes.some(route => pathname === route)

  if (isProtectedRoute && !isPublicRoute && !user) {
    // Determine which login page to redirect to
    let loginUrl: string
    if (pathname.startsWith('/admin/')) {
      loginUrl = '/l/login'
    } else if (pathname.startsWith('/l/')) {
      loginUrl = '/l/login'
    } else {
      loginUrl = '/b/login'
    }

    const url = request.nextUrl.clone()
    url.pathname = loginUrl
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
