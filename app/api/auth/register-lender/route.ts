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

    // Check if email already exists
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers()

    if (!listError && existingUsers?.users) {
      const existingUser = existingUsers.users.find(u => u.email === email)

      if (existingUser) {
        // Check if user already has lender role using user_roles table
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', existingUser.id)

        const roles = userRoles?.map(r => r.role) || []

        if (roles.includes('lender')) {
          return NextResponse.json(
            {
              error: 'This email is already registered as a lender. Please sign in instead.',
              errorCode: 'EMAIL_EXISTS_AS_LENDER'
            },
            { status: 409 }
          )
        }

        // User exists but doesn't have lender role - upgrade them to lender
        if (roles.length > 0) {
          // Add lender role to existing user
          const { error: roleError } = await supabase.rpc('add_user_role', {
            p_user_id: existingUser.id,
            p_role: 'lender'
          })

          if (roleError) {
            return NextResponse.json(
              { error: 'Failed to add lender role: ' + roleError.message },
              { status: 500 }
            )
          }

          // Update profile's app_role to lender for backward compatibility
          await supabase
            .from('profiles')
            .update({ app_role: 'lender' })
            .eq('user_id', existingUser.id)

          // NOTE: We do NOT create a lender record here
          // The user will be redirected to /l/complete-profile by middleware
          // where they will complete lender profile and ID photo verification
          // This ensures existing borrowers MUST complete full lender verification

          return NextResponse.json(
            {
              success: true,
              userId: existingUser.id,
              email: existingUser.email,
              message: 'Lender role added! You must complete lender profile and ID photo verification to access your lender account.',
              upgraded: true,
              requiresProfileCompletion: true  // Signal to frontend that profile completion is needed
            },
            { status: 200 }
          )
        }
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
      app_metadata: {
        app_role: 'lender',
        country_code: country, // Use the country selected by the user
        tier: 'BASIC',
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
        app_role: 'lender', // For backward compatibility
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

    // Add lender role using new multi-role system
    const { error: roleError } = await supabase.rpc('add_user_role', {
      p_user_id: authData.user.id,
      p_role: 'lender'
    })

    if (roleError) {
      // Cleanup
      await supabase.from('profiles').delete().eq('user_id', authData.user.id)
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json(
        { error: 'Failed to add lender role: ' + roleError.message },
        { status: 500 }
      )
    }

    // Create lender record with country
    const { error: lenderError } = await supabase
      .from('lenders')
      .insert({
        user_id: authData.user.id,
        country: country, // CRITICAL: Set lender's country for isolation
      })

    if (lenderError) {
      // Cleanup
      await supabase.rpc('remove_user_role', { p_user_id: authData.user.id, p_role: 'lender' })
      await supabase.from('profiles').delete().eq('user_id', authData.user.id)
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json(
        { error: 'Failed to create lender account: ' + lenderError.message },
        { status: 500 }
      )
    }

    // Create default subscription (Free tier)
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: authData.user.id,
        tier: 'BASIC',
      })

    if (subError) {
      console.error('Failed to create subscription:', subError)

      // Cleanup: delete lender and profile
      await supabase.from('lenders').delete().eq('user_id', authData.user.id)
      await supabase.from('profiles').delete().eq('user_id', authData.user.id)
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json(
        { error: 'Failed to create subscription. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        userId: authData.user.id,
        email: authData.user.email,
        message: 'Account created successfully. All records initialized.'
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
