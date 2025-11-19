import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { borrowerId, action, notes } = await req.json()

    // Update KYC status
    const newStatus = action === 'approve' ? 'verified' : 'rejected'
    
    const { error } = await supabase
      .from('borrowers')
      .update({ 
        kyc_status: newStatus,
        kyc_verified_at: action === 'approve' ? new Date().toISOString() : null,
        kyc_notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', borrowerId)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    // Log admin action
    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: `kyc_${action}`,
        resource_type: 'borrower',
        resource_id: borrowerId,
        details: { notes },
        created_at: new Date().toISOString()
      })

    // Send notification to borrower
    // await sendKYCNotification(borrowerId, newStatus)

    return NextResponse.json({ 
      success: true,
      status: newStatus 
    })
  } catch (error) {
    console.error('KYC verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify KYC' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get pending KYC verifications
    const { data: pendingKYC, error } = await supabase
      .from('borrowers')
      .select(`
        *,
        profiles!inner(
          full_name,
          email,
          phone,
          created_at
        )
      `)
      .eq('kyc_status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ pendingKYC })
  } catch (error) {
    console.error('KYC fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch KYC data' },
      { status: 500 }
    )
  }
}