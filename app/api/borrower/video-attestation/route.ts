import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashClientIp, clientUserAgent } from '@/lib/ip-hash'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    loan_request_id,
    video_hash,
    video_duration_seconds,
    video_size_bytes,
    attestation_transcript,
    attestation_language,
    spoken_name,
    spoken_date,        // YYYY-MM-DD
    spoken_amount,
    spoken_currency,
    sent_to_lender_email,
  } = body

  if (!video_hash || !attestation_transcript) {
    return NextResponse.json({ error: 'video_hash and attestation_transcript are required' }, { status: 400 })
  }

  // Resolve borrower_id from the user's link.
  const { data: link } = await supabase
    .from('borrower_user_links')
    .select('borrower_id')
    .eq('user_id', user.id)
    .single()
  if (!link) {
    return NextResponse.json({ error: 'No borrower profile linked to this user' }, { status: 404 })
  }

  const { error } = await supabase
    .from('video_verifications')
    .insert({
      borrower_id: link.borrower_id,
      borrower_user_id: user.id,
      lender_id: null,                          // bound later when a lender accepts the loan request
      loan_request_id: loan_request_id ?? null,
      video_hash,
      video_duration_seconds: video_duration_seconds ?? null,
      video_size_bytes: video_size_bytes ?? null,
      recorded_at: new Date().toISOString(),
      verification_type: 'spoken_attestation',
      attestation_transcript,
      attestation_language: attestation_language ?? 'en-US',
      spoken_name: spoken_name ?? null,
      spoken_date: spoken_date ?? null,
      spoken_amount: spoken_amount ?? null,
      spoken_currency: spoken_currency ?? null,
      sent_to_lender_email: sent_to_lender_email ?? null,
      borrower_ip_hash: hashClientIp(request),
      borrower_user_agent: clientUserAgent(request),
      voice_recorded: true,
      face_detected: true,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
