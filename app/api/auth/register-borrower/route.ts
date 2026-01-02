import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, country } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (!country) {
      return NextResponse.json(
        { error: 'Country is required for data isolation' },
        { status: 400 }
      )
    }

    // Create admin client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if email already exists - use direct auth check instead of listing all users
    let existingUser = null
    try {
      // Try to get user by email more efficiently
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      })

      if (!listError && users) {
        existingUser = users.find(u => u.email === email)
      }
    } catch (e) {
      console.error('Error checking existing users:', e)
    }

    if (existingUser) {
      // Check if user already has borrower role using user_roles table
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)

      const roles = userRoles?.map(r => r.role) || []

      if (roles.includes('borrower')) {
        return NextResponse.json(
          {
            error: 'This email is already registered as a borrower. Please sign in instead.',
            errorCode: 'EMAIL_EXISTS_AS_BORROWER'
          },
          { status: 409 }
        )
      }

      // User exists but doesn't have borrower role - upgrade them to borrower
      if (roles.length > 0) {
        // Add borrower role to existing user
        const { error: roleError } = await supabase.rpc('add_user_role', {
          p_user_id: existingUser.id,
          p_role: 'borrower'
        })

        if (roleError) {
          console.error('Role addition error:', roleError)
          return NextResponse.json(
            { error: 'Failed to add borrower role: ' + roleError.message },
            { status: 500 }
          )
        }

        // NOTE: We do NOT create a borrower record here
        // The user will be redirected to /b/onboarding by middleware
        // where they will complete borrower onboarding and verification
        // This ensures existing lenders MUST complete full borrower verification

        return NextResponse.json(
          {
            success: true,
            userId: existingUser.id,
            email: existingUser.email,
            message: 'Borrower role added! You must complete borrower onboarding and verification to access your borrower account.',
            upgraded: true,
            requiresOnboarding: true  // Signal to frontend that onboarding is needed
          },
          { status: 200 }
        )
      }
    }

    // Validate that the provided country exists
    const { data: countryData, error: countryError } = await supabase
      .from('countries')
      .select('code')
      .eq('code', country)
      .single()

    if (countryError || !countryData) {
      return NextResponse.json(
        { error: 'Invalid country selected. Please choose a valid country.' },
        { status: 400 }
      )
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email verification for security
      user_metadata: {
        app_role: 'borrower',
      },
    })

    if (authError) {
      // Provide more helpful error messages
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return NextResponse.json(
          {
            error: 'This email is already registered. Please sign in instead.',
            errorCode: 'EMAIL_EXISTS'
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Create profile with service role permissions - using provided country
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        full_name: 'Pending',
        country_code: country, // Use the country selected by the user
        app_role: 'borrower', // For backward compatibility
        onboarding_completed: false,
      })

    if (profileError) {
      // Log detailed error for debugging
      console.error('Profile creation error:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      })

      // Cleanup: delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json(
        {
          error: 'Failed to create profile: ' + profileError.message,
          errorCode: profileError.code,
          details: profileError.details
        },
        { status: 500 }
      )
    }

    // Add borrower role using new multi-role system
    const { error: roleError } = await supabase.rpc('add_user_role', {
      p_user_id: authData.user.id,
      p_role: 'borrower'
    })

    if (roleError) {
      // Cleanup
      await supabase.from('profiles').delete().eq('user_id', authData.user.id)
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json(
        { error: 'Failed to add borrower role: ' + roleError.message },
        { status: 500 }
      )
    }

    // Generate and send email verification link
    const { error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://credlio.com'}/auth/callback?type=signup&next=/b/onboarding`,
      }
    })

    if (linkError) {
      console.error('Failed to generate verification link:', linkError)
      // Don't fail registration, just log it - user can request resend
    }

    return NextResponse.json(
      {
        success: true,
        userId: authData.user.id,
        email: authData.user.email,
        message: 'Account created successfully. Please check your email to verify your account.'
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
