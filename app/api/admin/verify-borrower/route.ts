import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

    // Verify the requesting user is authenticated and is an admin
    const serverSupabase = await createServerClient()
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check user has admin role
    const { data: adminRole } = await serverSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!adminRole) {
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // Create admin client with service role key for operations that bypass RLS
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
        { error: 'Failed to update verification status' },
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
