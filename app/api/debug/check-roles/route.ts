import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Check roles for Shikongo
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', 'd122d015-70d3-42db-8a69-87554ad1e33a')

    return NextResponse.json({
      userId: 'd122d015-70d3-42db-8a69-87554ad1e33a',
      email: 'inekela34@gmail.com',
      name: 'Shikongo Shekupe',
      roles: roles || [],
      hasAdminRole: roles?.some(r => r.role === 'admin') || false,
      hasLenderRole: roles?.some(r => r.role === 'lender') || false,
      hasBorrowerRole: roles?.some(r => r.role === 'borrower') || false
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
