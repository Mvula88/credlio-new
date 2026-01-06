import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Test the RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_namibian_lenders')

    if (rpcError) {
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        details: rpcError
      })
    }

    // Check if lenders have profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', ['d122d015-70d3-42db-8a69-87554ad1e33a', '9afa3752-aac9-4f68-b467-83a7bcb86371'])

    // Check if lenders have auth.users records (via profiles)
    const { data: authUsers } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', ['d122d015-70d3-42db-8a69-87554ad1e33a', '9afa3752-aac9-4f68-b467-83a7bcb86371'])

    return NextResponse.json({
      success: true,
      rpcResult: rpcData,
      rpcCount: rpcData?.length || 0,
      profiles: profiles || [],
      profilesCount: profiles?.length || 0,
      authUsers: authUsers || [],
      authUsersCount: authUsers?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
