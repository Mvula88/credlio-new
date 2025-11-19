import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { borrower_id, action, reason } = await request.json()

    if (!borrower_id || !action) {
      return NextResponse.json(
        { error: 'borrower_id and action are required' },
        { status: 400 }
      )
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be either "approve" or "reject"' },
        { status: 400 }
      )
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'reason is required when rejecting' },
        { status: 400 }
      )
    }

    // Create admin client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get current admin user from the request
    // (In production, you'd validate the JWT token here)
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify the user is an admin
    // For now, we'll trust the middleware has already checked this

    // Get borrower user_id for notification
    const { data: verificationData, error: fetchError } = await supabase
      .from('borrower_self_verification_status')
      .select('user_id')
      .eq('borrower_id', borrower_id)
      .single()

    if (fetchError || !verificationData) {
      return NextResponse.json(
        { error: 'Verification record not found' },
        { status: 404 }
      )
    }

    const user_id = verificationData.user_id

    // Update verification status
    const updateData: any = {
      verification_status: action === 'approve' ? 'approved' : 'rejected',
      verified_at: new Date().toISOString()
    }

    if (action === 'reject') {
      updateData.rejection_reason = reason
    }

    const { error: updateError } = await supabase
      .from('borrower_self_verification_status')
      .update(updateData)
      .eq('borrower_id', borrower_id)

    if (updateError) {
      console.error('Error updating verification status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update verification status: ' + updateError.message },
        { status: 500 }
      )
    }

    // Send in-app notification to borrower
    const notificationTitle = action === 'approve'
      ? '✅ Verification Approved!'
      : '❌ Verification Rejected'

    const notificationMessage = action === 'approve'
      ? 'Your identity verification has been approved. You can now access all borrower features and apply for loans.'
      : `Your identity verification was rejected. Reason: ${reason}. Please re-submit your verification documents.`

    const notificationLink = action === 'approve' ? '/b/overview' : '/b/verify'

    const { error: notifError } = await supabase.rpc('create_notification', {
      p_user_id: user_id,
      p_type: action === 'approve' ? 'kyc_approved' : 'kyc_rejected',
      p_title: notificationTitle,
      p_message: notificationMessage,
      p_link: notificationLink
    })

    if (notifError) {
      console.error('Error creating notification:', notifError)
      // Don't fail the request if notification fails
    }

    return NextResponse.json(
      {
        success: true,
        message: `Verification ${action === 'approve' ? 'approved' : 'rejected'} successfully`
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
