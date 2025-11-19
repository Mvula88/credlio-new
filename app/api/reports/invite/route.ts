import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/reports/invite
 * Invite an unregistered borrower to join the platform (lender only)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a lender
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!profile || profile.role !== 'lender') {
      return NextResponse.json({ error: 'Only lenders can invite borrowers' }, { status: 403 })
    }

    const body = await req.json()
    const { borrowerId, email, phone } = body

    if (!borrowerId) {
      return NextResponse.json({
        error: 'Missing required field: borrowerId'
      }, { status: 400 })
    }

    if (!email && !phone) {
      return NextResponse.json({
        error: 'Either email or phone must be provided'
      }, { status: 400 })
    }

    // Call database function to invite borrower
    const { data: success, error } = await supabase.rpc('invite_borrower_to_platform', {
      p_borrower_id: borrowerId,
      p_email: email || null,
      p_phone: phone || null
    })

    if (error) {
      console.error('Error inviting borrower:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // TODO: Send actual invitation email/SMS
    // This would integrate with your email/SMS service (SendGrid, Twilio, etc.)

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully'
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
