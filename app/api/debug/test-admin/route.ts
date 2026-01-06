import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({
        authenticated: false,
        error: 'Not authenticated'
      })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Test RPC call as this user
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_namibian_lenders')

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email
      },
      profile: profile,
      isAdmin: profile?.app_role === 'admin',
      rpcResult: rpcError ? null : rpcData,
      rpcError: rpcError ? rpcError.message : null,
      rpcCount: rpcData?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 })
  }
}
