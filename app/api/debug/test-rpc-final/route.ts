import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check roles in user_roles table
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const hasAdminRole = userRoles?.some(r => r.role === 'admin') || false

    // Test the RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_namibian_lenders')

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      userRoles: userRoles?.map(r => r.role) || [],
      hasAdminRole,
      rpcSuccess: !rpcError,
      rpcError: rpcError?.message || null,
      rpcData: rpcData || [],
      rpcCount: rpcData?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
