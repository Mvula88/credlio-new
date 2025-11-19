import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Create admin client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get the current user ID from the request
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if lender record exists
    const { data: existingLender, error: lenderCheckError } = await supabase
      .from('lenders')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('Lender check:', { existingLender, lenderCheckError })

    if (!existingLender && !lenderCheckError) {
      // Create lender record
      const { error: lenderError } = await supabase
        .from('lenders')
        .insert({
          user_id: userId,
        })

      if (lenderError) {
        console.error('Error creating lender:', lenderError)
        return NextResponse.json(
          { error: 'Failed to create lender record: ' + lenderError.message },
          { status: 500 }
        )
      }
    } else if (lenderCheckError) {
      console.log('Lender exists but has error:', lenderCheckError)
    }

    // Check if subscription exists
    const { data: existingSubscription, error: subCheckError } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('Subscription check:', { existingSubscription, subCheckError })

    if (!existingSubscription && !subCheckError) {
      // Create subscription record (no status column in this table)
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          tier: 'BASIC',
        })

      if (subError) {
        console.error('Error creating subscription:', subError)
        return NextResponse.json(
          { error: 'Failed to create subscription: ' + subError.message },
          { status: 500 }
        )
      }
    } else if (subCheckError) {
      console.log('Subscription exists but has error:', subCheckError)
    }

    // Verify all records exist
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    const { data: lender } = await supabase
      .from('lenders')
      .select('*')
      .eq('user_id', userId)
      .single()

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({
      success: true,
      message: 'Account fixed successfully',
      data: {
        profile: profile ? 'exists' : 'missing',
        lender: lender ? 'exists' : 'missing',
        subscription: subscription ? 'exists' : 'missing',
      },
    })
  } catch (error: any) {
    console.error('Error fixing account:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
