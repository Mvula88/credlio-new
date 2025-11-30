import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Run profile and lender queries in parallel
  const [profileResult, lenderResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).single(),
    supabase.from('lenders').select('*').eq('user_id', user.id).single()
  ])

  const profile = profileResult.data
  const lender = lenderResult.data

  // Get currency if country_code exists
  let currency = null
  if (profile?.country_code) {
    const { data: currencyData } = await supabase
      .from('country_currency_allowed')
      .select('*')
      .eq('country_code', profile.country_code)
      .eq('is_default', true)
      .single()

    currency = currencyData
  }

  return NextResponse.json({
    user_id: user.id,
    profile,
    lender,
    currency
  })
}
