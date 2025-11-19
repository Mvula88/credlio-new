import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get borrower link
    const { data: linkData } = await supabase
      .from('borrower_user_links')
      .select('borrower_id')
      .eq('user_id', user.id)
      .single()

    if (!linkData) {
      return NextResponse.json({
        user_id: user.id,
        has_borrower_record: false,
        verification_status: null,
        message: 'No borrower record found - should redirect to /b/onboarding'
      })
    }

    // Get verification status
    const { data: verificationData } = await supabase
      .from('borrower_self_verification_status')
      .select('*')
      .eq('borrower_id', linkData.borrower_id)
      .single()

    return NextResponse.json({
      user_id: user.id,
      borrower_id: linkData.borrower_id,
      has_borrower_record: true,
      verification_status: verificationData?.verification_status || 'no_record',
      selfie_uploaded: verificationData?.selfie_uploaded || false,
      created_at: verificationData?.created_at,
      verified_at: verificationData?.verified_at,
      rejection_reason: verificationData?.rejection_reason,
      message: verificationData?.verification_status === 'approved'
        ? 'User is verified and should have access'
        : verificationData?.verification_status === 'pending'
        ? 'User should be redirected to /b/pending-verification'
        : 'User should be redirected to /b/onboarding'
    })
  } catch (error) {
    console.error('Check verification error:', error)
    return NextResponse.json(
      { error: 'Failed to check verification status' },
      { status: 500 }
    )
  }
}
