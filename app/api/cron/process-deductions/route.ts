import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Scheduled Deduction Processor
 *
 * This API route should be called daily by a cron job (e.g., Vercel Cron, GitHub Actions)
 * It processes all due deductions by charging borrower cards via DPO
 *
 * SETUP:
 * 1. Add to vercel.json:
 *    {
 *      "crons": [{
 *        "path": "/api/cron/process-deductions",
 *        "schedule": "0 8 * * *"  // Daily at 8 AM
 *      }]
 *    }
 *
 * 2. Secure with Vercel Cron Secret:
 *    - Add CRON_SECRET to environment variables
 *    - Vercel automatically sends Authorization: Bearer <CRON_SECRET>
 *
 * 3. Or use external cron service (cron-job.org, etc.)
 */

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

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized request')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Cron] Starting deduction processing...', new Date().toISOString())

    const today = new Date().toISOString().split('T')[0]

    // Get all due deductions
    const { data: dueDeductions, error: fetchError } = await supabase
      .from('scheduled_deductions')
      .select(`
        *,
        mandate:payment_mandates(*),
        payment_method:payment_methods(*),
        loan:loans(*)
      `)
      .eq('status', 'scheduled')
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })

    if (fetchError) {
      console.error('[Cron] Error fetching deductions:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch deductions', details: fetchError.message },
        { status: 500 }
      )
    }

    console.log(`[Cron] Found ${dueDeductions?.length || 0} due deductions`)

    if (!dueDeductions || dueDeductions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No deductions due today',
        processed: 0
      })
    }

    const results = {
      total: dueDeductions.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[]
    }

    // Process each deduction
    for (const deduction of dueDeductions) {
      try {
        // Check if mandate is still active
        if (deduction.mandate.status !== 'active') {
          console.log(`[Cron] Skipping - Mandate not active: ${deduction.mandate.mandate_reference}`)
          results.skipped++

          // Mark as cancelled
          await supabase
            .from('scheduled_deductions')
            .update({ status: 'cancelled' })
            .eq('id', deduction.id)

          continue
        }

        // Check if payment method exists
        if (!deduction.payment_method) {
          console.error(`[Cron] Skipping - No payment method: ${deduction.id}`)
          results.skipped++
          continue
        }

        console.log(`[Cron] Processing deduction ${deduction.id} for mandate ${deduction.mandate.mandate_reference}`)

        // Update status to processing
        await supabase
          .from('scheduled_deductions')
          .update({
            status: 'processing',
            last_attempt_at: new Date().toISOString(),
            attempt_count: (deduction.attempt_count || 0) + 1
          })
          .eq('id', deduction.id)

        // Call DPO API to charge card
        const chargeResult = await chargeCard({
          amount: deduction.amount,
          currency: deduction.currency,
          cardToken: deduction.payment_method.card_token,
          mandateReference: deduction.mandate.mandate_reference,
          deductionId: deduction.id,
          loanId: deduction.loan_id
        })

        if (chargeResult.success) {
          console.log(`[Cron] ✅ Deduction successful: ${deduction.id}`)
          results.success++

          // Note: Webhook will handle the actual transaction recording
          // We just mark it as processing and wait for webhook
        } else {
          console.error(`[Cron] ❌ Deduction failed: ${deduction.id}`, chargeResult.error)
          results.failed++
          results.errors.push(`Deduction ${deduction.id}: ${chargeResult.error}`)

          // Update with failure info
          const attemptCount = (deduction.attempt_count || 0) + 1
          const maxAttempts = deduction.max_attempts || 3

          if (attemptCount >= maxAttempts) {
            // Max attempts reached - mark as failed
            await supabase
              .from('scheduled_deductions')
              .update({
                status: 'failed',
                failure_reason: chargeResult.error
              })
              .eq('id', deduction.id)

            // TODO: Notify lender and borrower about failed deduction
          } else {
            // Schedule retry in 24 hours
            const nextRetry = new Date()
            nextRetry.setHours(nextRetry.getHours() + 24)

            await supabase
              .from('scheduled_deductions')
              .update({
                status: 'scheduled', // Back to scheduled for retry
                next_retry_at: nextRetry.toISOString(),
                failure_reason: chargeResult.error
              })
              .eq('id', deduction.id)
          }
        }

      } catch (error: any) {
        console.error(`[Cron] Error processing deduction ${deduction.id}:`, error)
        results.failed++
        results.errors.push(`Deduction ${deduction.id}: ${error.message}`)
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('[Cron] Deduction processing completed:', results)

    return NextResponse.json({
      success: true,
      message: 'Deductions processed',
      results
    })

  } catch (error: any) {
    console.error('[Cron] Fatal error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * Charge a card via DPO API
 *
 * TODO: Replace with actual DPO API integration
 */
async function chargeCard(params: {
  amount: number
  currency: string
  cardToken: string
  mandateReference: string
  deductionId: string
  loanId: string
}): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  try {
    // TODO: Replace with actual DPO API call
    // Example DPO API structure (check their documentation):

    const dpoApiUrl = process.env.DPO_API_URL || 'https://api.dpo.com/v1'
    const dpoApiKey = process.env.DPO_API_KEY
    const dpoCompanyToken = process.env.DPO_COMPANY_TOKEN

    if (!dpoApiKey || !dpoCompanyToken) {
      console.error('[DPO] Missing API credentials')
      return {
        success: false,
        error: 'DPO API credentials not configured'
      }
    }

    // Example DPO charge request
    const response = await fetch(`${dpoApiUrl}/charge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dpoApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        companyToken: dpoCompanyToken,
        cardToken: params.cardToken,
        amount: params.amount,
        currency: params.currency,
        reference: params.mandateReference,
        description: `Loan repayment - ${params.mandateReference}`,
        metadata: {
          deduction_id: params.deductionId,
          loan_id: params.loanId
        }
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[DPO] API error:', error)
      return {
        success: false,
        error: `DPO API error: ${response.status}`
      }
    }

    const data = await response.json()

    if (data.status === 'success' || data.status === 'approved') {
      return {
        success: true,
        transactionId: data.transaction_id
      }
    } else {
      return {
        success: false,
        error: data.error_message || 'Payment declined'
      }
    }

  } catch (error: any) {
    console.error('[DPO] Charge error:', error)
    return {
      success: false,
      error: error.message || 'Failed to charge card'
    }
  }
}

// For manual testing - GET request with secret
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Forward to POST handler
  return POST(request)
}
