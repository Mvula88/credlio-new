import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  getSmileIdConfig,
  resultCodeToOutcome,
  verifySmileIdSignature,
} from '@/lib/smile-id'

/**
 * Smile ID server-to-server callback.
 *
 * Smile ID POSTs here once a job finishes. We:
 *   1. Verify the request actually came from Smile via HMAC signature.
 *   2. Extract the result and our PartnerParams (which carries borrower_id).
 *   3. Insert into smile_id_verifications. The DB trigger
 *      apply_smile_id_outcome propagates approved/rejected to
 *      borrower_self_verification_status.
 *
 * If signature verification fails we still record the row (with
 * signature_verified=false) so admins can see the attempt, but the trigger
 * will not auto-approve based on it.
 */
export async function POST(request: NextRequest) {
  const config = getSmileIdConfig()
  if (!config) {
    console.error('Smile ID callback received but SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY are not configured')
    return NextResponse.json({ error: 'Smile ID is not configured' }, { status: 503 })
  }

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Smile ID delivers signature material in the body. The exact field names
  // differ between SDK versions; accept the common spellings.
  const timestamp = payload.timestamp ?? payload.Timestamp
  const signature = payload.signature ?? payload.Signature
  const partnerId = payload.partner_id ?? payload.PartnerId ?? payload.SmilePartnerID

  const sigCheck = verifySmileIdSignature({
    timestamp,
    signature,
    partnerId,
    apiKey: config.apiKey,
  })

  // PartnerParams is the bag of opaque data we sent in with the job. We rely
  // on it to carry borrower_id and user_id so we can attribute the result.
  const partnerParams = payload.PartnerParams ?? payload.partner_params ?? {}
  const borrowerId = partnerParams.borrower_id ?? partnerParams.borrowerId
  const userId = partnerParams.user_id ?? partnerParams.userId
  const jobId = partnerParams.job_id ?? partnerParams.jobId ?? payload.SmileJobID

  if (!borrowerId || !userId || !jobId) {
    return NextResponse.json(
      { error: 'PartnerParams missing borrower_id/user_id/job_id' },
      { status: 400 }
    )
  }

  const resultCode = payload.ResultCode ?? payload.result_code
  const resultText = payload.ResultText ?? payload.result_text
  const isFinal = payload.IsFinalResult === 'true' || payload.IsFinalResult === true
  const confidence = typeof payload.ConfidenceValue === 'number'
    ? payload.ConfidenceValue
    : payload.ConfidenceValue
      ? Number(payload.ConfidenceValue)
      : null
  const outcome = resultCodeToOutcome(resultCode)

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Idempotent insert keyed on job_id (UNIQUE in the table) so retries from
  // Smile ID don't duplicate rows.
  const { error: insertError } = await supabase
    .from('smile_id_verifications')
    .upsert({
      borrower_id: borrowerId,
      user_id: userId,
      job_id: jobId,
      smile_job_id: payload.SmileJobID ?? null,
      job_type: partnerParams.job_type ?? payload.job_type ?? null,
      country_code: partnerParams.country ?? partnerParams.country_code ?? null,
      id_type: partnerParams.id_type ?? null,
      result_code: resultCode ? String(resultCode) : null,
      result_text: resultText ?? null,
      confidence_value: confidence,
      is_final_result: isFinal,
      outcome,
      actions: payload.Actions ?? null,
      raw_response: payload,
      signature_verified: sigCheck.valid,
      signature_error: sigCheck.valid ? null : sigCheck.error ?? null,
      completed_at: isFinal ? new Date().toISOString() : null,
    }, { onConflict: 'job_id' })

  if (insertError) {
    console.error('Failed to persist Smile ID result:', insertError)
    return NextResponse.json({ error: 'Failed to persist result' }, { status: 500 })
  }

  // Per Smile ID docs the callback should return 200 even on signature
  // failure — they retry on non-2xx. The signature_verified flag in the row
  // is what gates downstream auto-approval.
  return NextResponse.json({ received: true, signature_verified: sigCheck.valid })
}
