import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check subscription directly
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Call get_effective_tier RPC
    const { data: effectiveTier, error: tierError } = await supabase
      .rpc('get_effective_tier', { p_user_id: user.id })

    // Check lender info
    const { data: lender } = await supabase
      .from('lenders')
      .select('country, business_name')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      subscription: subscription || null,
      effectiveTier: effectiveTier || 'FREE',
      tierError: tierError?.message || null,
      lenderCountry: lender?.country || null,
      businessName: lender?.business_name || null
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
