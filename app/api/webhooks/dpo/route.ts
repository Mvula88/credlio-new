import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Create Supabase client with service role key for admin access
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

/**
 * DPO Payment Webhook Handler
 *
 * Receives payment notifications from DPO and updates the database
 *
 * Expected webhook events:
 * - payment.success: Payment completed successfully
 * - payment.failed: Payment failed
 * - payment.refunded: Payment was refunded
 * - payment.disputed: Payment was disputed/chargeback
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook payload
    const payload = await request.json()
    const signature = request.headers.get('x-dpo-signature')
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

    console.log('[DPO Webhook] Received:', {
      event: payload.event_type,
      transaction_id: payload.transaction_id,
      timestamp: new Date().toISOString()
    })

    // Verify webhook signature (implement based on DPO's signature mechanism)
    const signatureValid = verifyDPOSignature(payload, signature)

    // Log webhook to database (important for audit trail)
    const { data: logData, error: logError } = await supabase
      .from('payment_webhook_logs')
      .insert({
        provider: 'dpo',
        event_type: payload.event_type,
        raw_payload: payload,
        signature_valid: signatureValid,
        ip_address: ipAddress,
        processed: false
      })
      .select()
      .single()

    if (logError) {
      console.error('[DPO Webhook] Failed to log webhook:', logError)
    }

    const webhookLogId = logData?.id

    // Verify signature before processing
    if (!signatureValid) {
      console.error('[DPO Webhook] Invalid signature')
      await updateWebhookLog(webhookLogId, false, 'Invalid signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Process based on event type
    let result
    switch (payload.event_type) {
      case 'payment.success':
        result = await handlePaymentSuccess(payload, webhookLogId)
        break
      case 'payment.failed':
        result = await handlePaymentFailed(payload, webhookLogId)
        break
      case 'payment.refunded':
        result = await handlePaymentRefunded(payload, webhookLogId)
        break
      case 'payment.disputed':
        result = await handlePaymentDisputed(payload, webhookLogId)
        break
      default:
        console.warn('[DPO Webhook] Unknown event type:', payload.event_type)
        await updateWebhookLog(webhookLogId, false, `Unknown event type: ${payload.event_type}`)
        return NextResponse.json(
          { error: 'Unknown event type' },
          { status: 400 }
        )
    }

    // Mark webhook as processed
    await updateWebhookLog(webhookLogId, true, null, result.transaction_id, result.mandate_id)

    return NextResponse.json({ success: true, message: 'Webhook processed' })

  } catch (error: any) {
    console.error('[DPO Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(payload: any, webhookLogId: string) {
  const {
    transaction_id: dpoTransactionId,
    transaction_reference,
    amount,
    currency,
    mandate_id,
    scheduled_deduction_id
  } = payload

  console.log('[DPO Webhook] Processing payment success:', { dpoTransactionId, transaction_reference })

  // Get scheduled deduction
  const { data: scheduledDeduction, error: scheduleError } = await supabase
    .from('scheduled_deductions')
    .select('*, mandate:payment_mandates(*)')
    .eq('id', scheduled_deduction_id)
    .single()

  if (scheduleError || !scheduledDeduction) {
    throw new Error(`Scheduled deduction not found: ${scheduled_deduction_id}`)
  }

  // Calculate platform fee (2%)
  const grossAmount = parseFloat(amount)
  const platformFeePercentage = 0.02
  const platformFee = grossAmount * platformFeePercentage
  const lenderAmount = grossAmount - platformFee

  // Create deduction transaction
  const { data: transaction, error: transactionError } = await supabase
    .from('deduction_transactions')
    .insert({
      mandate_id: scheduledDeduction.mandate_id,
      loan_id: scheduledDeduction.loan_id,
      scheduled_deduction_id: scheduled_deduction_id,
      payment_method_id: scheduledDeduction.payment_method_id,
      transaction_reference: transaction_reference,
      dpo_transaction_id: dpoTransactionId,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      lender_amount: lenderAmount,
      currency: currency,
      platform_fee_percentage: platformFeePercentage,
      status: 'success',
      completed_at: new Date().toISOString()
    })
    .select()
    .single()

  if (transactionError) {
    throw new Error(`Failed to create transaction: ${transactionError.message}`)
  }

  // Update scheduled deduction status
  await supabase
    .from('scheduled_deductions')
    .update({
      status: 'completed',
      transaction_id: transaction.id,
      processed_at: new Date().toISOString()
    })
    .eq('id', scheduled_deduction_id)

  // Create next scheduled deduction (if mandate is still active)
  if (scheduledDeduction.mandate.status === 'active') {
    const nextDate = calculateNextDeductionDate(
      scheduledDeduction.scheduled_date,
      scheduledDeduction.mandate.frequency,
      scheduledDeduction.mandate.deduction_day
    )

    if (nextDate) {
      await supabase
        .from('scheduled_deductions')
        .insert({
          mandate_id: scheduledDeduction.mandate_id,
          loan_id: scheduledDeduction.loan_id,
          payment_method_id: scheduledDeduction.payment_method_id,
          scheduled_date: nextDate,
          amount: scheduledDeduction.amount,
          currency: scheduledDeduction.currency,
          status: 'scheduled'
        })
    }
  }

  // TODO: Trigger payout to lender (lender_amount)
  // TODO: Send notification to lender about successful collection

  console.log('[DPO Webhook] Payment success processed:', transaction.id)

  return {
    transaction_id: transaction.id,
    mandate_id: scheduledDeduction.mandate_id
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(payload: any, webhookLogId: string) {
  const {
    transaction_id: dpoTransactionId,
    scheduled_deduction_id,
    failure_code,
    failure_message
  } = payload

  console.log('[DPO Webhook] Processing payment failure:', { dpoTransactionId, failure_code })

  // Get scheduled deduction
  const { data: scheduledDeduction } = await supabase
    .from('scheduled_deductions')
    .select('*')
    .eq('id', scheduled_deduction_id)
    .single()

  if (!scheduledDeduction) {
    throw new Error(`Scheduled deduction not found: ${scheduled_deduction_id}`)
  }

  // Update scheduled deduction
  const attemptCount = (scheduledDeduction.attempt_count || 0) + 1
  const maxAttempts = scheduledDeduction.max_attempts || 3

  let status = 'failed'
  let nextRetryAt = null

  if (attemptCount < maxAttempts) {
    // Schedule retry in 24 hours
    status = 'failed' // Will retry
    nextRetryAt = new Date()
    nextRetryAt.setHours(nextRetryAt.getHours() + 24)
  }

  await supabase
    .from('scheduled_deductions')
    .update({
      status,
      attempt_count: attemptCount,
      next_retry_at: nextRetryAt?.toISOString(),
      last_attempt_at: new Date().toISOString(),
      failure_reason: `${failure_code}: ${failure_message}`
    })
    .eq('id', scheduled_deduction_id)

  // Create failed transaction record
  const { data: transaction } = await supabase
    .from('deduction_transactions')
    .insert({
      mandate_id: scheduledDeduction.mandate_id,
      loan_id: scheduledDeduction.loan_id,
      scheduled_deduction_id: scheduled_deduction_id,
      payment_method_id: scheduledDeduction.payment_method_id,
      transaction_reference: `FAILED-${Date.now()}`,
      dpo_transaction_id: dpoTransactionId,
      gross_amount: scheduledDeduction.amount,
      platform_fee: 0,
      lender_amount: 0,
      currency: scheduledDeduction.currency,
      status: 'failed',
      failure_code,
      failure_message,
      failed_at: new Date().toISOString()
    })
    .select()
    .single()

  // TODO: Notify lender about failed payment
  // TODO: Notify borrower if max attempts reached

  console.log('[DPO Webhook] Payment failure processed')

  return {
    transaction_id: transaction?.id,
    mandate_id: scheduledDeduction.mandate_id
  }
}

/**
 * Handle refunded payment
 */
async function handlePaymentRefunded(payload: any, webhookLogId: string) {
  const { transaction_id: dpoTransactionId } = payload

  console.log('[DPO Webhook] Processing refund:', { dpoTransactionId })

  // Find original transaction
  const { data: transaction, error } = await supabase
    .from('deduction_transactions')
    .update({
      status: 'refunded',
      updated_at: new Date().toISOString()
    })
    .eq('dpo_transaction_id', dpoTransactionId)
    .select()
    .single()

  if (error) {
    throw new Error(`Transaction not found: ${dpoTransactionId}`)
  }

  // TODO: Notify lender about refund
  // TODO: Handle platform fee refund logic

  console.log('[DPO Webhook] Refund processed')

  return {
    transaction_id: transaction.id,
    mandate_id: transaction.mandate_id
  }
}

/**
 * Handle disputed payment (chargeback)
 */
async function handlePaymentDisputed(payload: any, webhookLogId: string) {
  const { transaction_id: dpoTransactionId } = payload

  console.log('[DPO Webhook] Processing dispute:', { dpoTransactionId })

  // Find original transaction
  const { data: transaction, error } = await supabase
    .from('deduction_transactions')
    .update({
      status: 'disputed',
      updated_at: new Date().toISOString()
    })
    .eq('dpo_transaction_id', dpoTransactionId)
    .select()
    .single()

  if (error) {
    throw new Error(`Transaction not found: ${dpoTransactionId}`)
  }

  // TODO: Notify lender about dispute
  // TODO: Pause mandate until dispute is resolved

  console.log('[DPO Webhook] Dispute processed')

  return {
    transaction_id: transaction.id,
    mandate_id: transaction.mandate_id
  }
}

/**
 * Update webhook log with processing result
 */
async function updateWebhookLog(
  logId: string,
  processed: boolean,
  error: string | null,
  transactionId?: string,
  mandateId?: string
) {
  if (!logId) return

  await supabase
    .from('payment_webhook_logs')
    .update({
      processed,
      processed_at: new Date().toISOString(),
      processing_error: error,
      transaction_id: transactionId,
      mandate_id: mandateId
    })
    .eq('id', logId)
}

/**
 * Verify DPO webhook signature
 *
 * TODO: Implement actual signature verification based on DPO's documentation
 * This is a placeholder - replace with actual DPO signature verification
 */
function verifyDPOSignature(payload: any, signature: string | null): boolean {
  // In production, you would:
  // 1. Get your DPO webhook secret from environment variables
  // 2. Create a signature using the payload and secret (e.g., HMAC SHA256)
  // 3. Compare with the provided signature

  const webhookSecret = process.env.DPO_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.warn('[DPO Webhook] No webhook secret configured - skipping signature verification')
    return true // Allow in development
  }

  if (!signature) {
    console.warn('[DPO Webhook] No signature provided')
    return false
  }

  // TODO: Implement actual HMAC signature verification
  // Example with crypto:
  // const crypto = require('crypto')
  // const expectedSignature = crypto
  //   .createHmac('sha256', webhookSecret)
  //   .update(JSON.stringify(payload))
  //   .digest('hex')
  // return signature === expectedSignature

  return true // Placeholder - implement real verification
}

/**
 * Calculate next deduction date based on frequency
 */
function calculateNextDeductionDate(
  currentDate: string,
  frequency: string,
  deductionDay: number
): string | null {
  const current = new Date(currentDate)
  let next = new Date(current)

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'biweekly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      next.setDate(deductionDay)
      break
    default:
      return null
  }

  return next.toISOString().split('T')[0]
}

// Allow only POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}
