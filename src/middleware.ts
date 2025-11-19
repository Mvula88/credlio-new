import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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
          // In Next.js 15, request.cookies is read-only
          // Only set cookies on the response
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Public routes
  const publicRoutes = ['/', '/borrower', '/l/login', '/l/register', '/b/login', '/b/register', '/a/login', '/admin/login']
  if (publicRoutes.includes(path)) {
    return supabaseResponse
  }

  // Allow complete-profile pages even if session is being refreshed
  if (path === '/l/complete-profile' || path === '/b/onboarding') {
    return supabaseResponse
  }

  // Protected routes - require authentication
  if (!user) {
    const url = request.nextUrl.clone()
    
    // Determine which login page based on path
    if (path.startsWith('/b/')) {
      url.pathname = '/b/login'
    } else if (path.startsWith('/l/')) {
      url.pathname = '/l/login'
    } else if (path.startsWith('/a/') || path.startsWith('/admin/')) {
      url.pathname = '/admin/login'
    } else {
      url.pathname = '/login'
    }
    
    return NextResponse.redirect(url)
  }

  // Get user profile for role checking
  const { data: profile } = await supabase
    .from('profiles')
    .select('app_role, onboarding_completed, country_code')
    .eq('user_id', user.id)
    .maybeSingle()

  // If no profile, check user_roles table as fallback
  if (!profile) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []

    // If user has roles but no profile, they might be in the old system
    // Allow them through and let the page handle profile creation
    if (roles.length > 0) {
      // Check role-based access using user_roles
      if (path.startsWith('/b/') && !roles.includes('borrower')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      if (path.startsWith('/l/') && !roles.includes('lender')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      if (path.startsWith('/a/') && !roles.includes('admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }

      // Allow through - profile will be created by the page
      return supabaseResponse
    }

    // No profile and no roles, redirect to registration
    if (path.startsWith('/b/')) {
      return NextResponse.redirect(new URL('/b/register', request.url))
    } else if (path.startsWith('/l/')) {
      return NextResponse.redirect(new URL('/l/register', request.url))
    }
    return NextResponse.redirect(new URL('/register', request.url))
  }

  // Role-based access control using profiles
  if (path.startsWith('/b/') && profile.app_role !== 'borrower') {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  if (path.startsWith('/l/') && profile.app_role !== 'lender') {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  if ((path.startsWith('/a/') || path.startsWith('/admin/')) && profile.app_role !== 'admin') {
    // Check multi-role system for admin access
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []

    if (!roles.includes('admin')) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  // Borrower onboarding check - works for both single-role and multi-role users
  // Check if user is accessing borrower routes
  if (path.startsWith('/b/') && !path.startsWith('/b/login') && !path.startsWith('/b/register')) {
    // Check if user has borrower role
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []
    const hasBorrowerRole = roles.includes('borrower') || profile.app_role === 'borrower'

    if (hasBorrowerRole) {
      // Check if borrower record exists (created during onboarding)
      const { data: borrower } = await supabase
        .from('borrowers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      // If no borrower record, redirect to onboarding
      if (!borrower && !path.startsWith('/b/onboarding')) {
        return NextResponse.redirect(new URL('/b/onboarding', request.url))
      }

      // If borrower record exists, check document verification
      if (borrower) {
        const { data: verificationStatus } = await supabase
          .from('borrower_self_verification_status')
          .select('verification_status, selfie_uploaded')
          .eq('borrower_id', borrower.id)
          .maybeSingle()

        // STRICT CHECK: User must have verification approved to access ANY borrower page
        // If no verification record OR not approved OR no selfie, redirect to onboarding
        const isFullyVerified = verificationStatus &&
          verificationStatus.verification_status === 'approved' &&
          verificationStatus.selfie_uploaded

        // Block ALL borrower pages except onboarding and pending-verification until approved
        const allowedPendingPaths = ['/b/onboarding', '/b/pending-verification', '/b/settings']
        const isAllowedPath = allowedPendingPaths.some(allowedPath => path.startsWith(allowedPath))

        if (!isFullyVerified && !isAllowedPath) {
          // If they have pending/rejected status, send to pending page
          // Otherwise send to onboarding
          if (verificationStatus && (verificationStatus.verification_status === 'pending' || verificationStatus.verification_status === 'rejected')) {
            if (path !== '/b/pending-verification') {
              return NextResponse.redirect(new URL('/b/pending-verification', request.url))
            }
          } else {
            return NextResponse.redirect(new URL('/b/onboarding', request.url))
          }
        }
      }
    }
  }

  // Lender profile completion check - REQUIRED - works for both single-role and multi-role users
  // Check if user is accessing lender routes
  if (path.startsWith('/l/') && !path.startsWith('/l/login') && !path.startsWith('/l/register')) {
    // Check if user has lender role
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []
    const hasLenderRole = roles.includes('lender') || profile.app_role === 'lender'

    if (hasLenderRole) {
      // Check if lender record exists (created during profile completion)
      const { data: lender } = await supabase
        .from('lenders')
        .select('profile_completed, id_photo_uploaded_at')
        .eq('user_id', user.id)
        .maybeSingle()

      // If no lender record OR profile not completed, redirect to complete-profile
      if ((!lender || !lender.profile_completed || !lender.id_photo_uploaded_at) && path !== '/l/complete-profile') {
        return NextResponse.redirect(new URL('/l/complete-profile', request.url))
      }
    }
  }

  // Get subscription for tracking (usage limits will be added later)
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .maybeSingle()

  // Set custom claims in response headers for client components
  if (profile) {
    supabaseResponse.headers.set('X-User-Role', profile.app_role)
    supabaseResponse.headers.set('X-User-Country', profile.country_code || 'NA')
  }
  supabaseResponse.headers.set('X-User-Tier', subscription?.tier || 'BASIC')

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
}