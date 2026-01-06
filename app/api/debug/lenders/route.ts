import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Check total lenders
    const { count: totalLenders } = await supabase
      .from('lenders')
      .select('*', { count: 'exact', head: true })

    // Check Namibian lenders
    const { data: namibianLenders } = await supabase
      .from('lenders')
      .select('user_id, business_name, id_number, country, contact_number')
      .eq('country', 'NA')

    // Check all countries
    const { data: allLenders } = await supabase
      .from('lenders')
      .select('country')

    const byCountry: Record<string, number> = {}
    allLenders?.forEach(l => {
      const country = l.country || 'NULL'
      byCountry[country] = (byCountry[country] || 0) + 1
    })

    return NextResponse.json({
      totalLenders,
      namibianLenders: namibianLenders?.length || 0,
      namibianLendersData: namibianLenders,
      countryDistribution: byCountry
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
