import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Test the RPC function with service role
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_namibian_lenders')

    if (rpcError) {
      return NextResponse.json({
        success: false,
        error: rpcError.message,
        errorDetails: rpcError
      })
    }

    return NextResponse.json({
      success: true,
      lendersCount: rpcData?.length || 0,
      lenders: rpcData
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
