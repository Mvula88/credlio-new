import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
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

    // Get user ID from query parameter
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    // Check lender
    const { data: lender, error: lenderError } = await supabase
      .from('lenders')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    // Check subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return NextResponse.json({
      userId,
      profile: profile ? { ...profile, error: null } : { error: profileError?.message || 'Not found' },
      lender: lender ? { ...lender, error: null } : { error: lenderError?.message || 'Not found' },
      subscription: subscription ? { ...subscription, error: null } : { error: subscriptionError?.message || 'Not found' },
    })
  } catch (error: any) {
    console.error('Error checking account:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
