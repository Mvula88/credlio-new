import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/cron/check-overdue-reports
 *
 * Cron job endpoint that checks for overdue borrower reports and updates their status.
 *
 * This endpoint can be called by:
 * - Vercel Cron (if using Vercel hosting)
 * - GitHub Actions
 * - External cron services (cron-job.org, etc.)
 *
 * For security, this endpoint should be protected with a secret token in production.
 */
export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify cron secret (mandatory)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[CRON] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    console.log('[CRON] Starting overdue reports check...')

    // Step 0: Run the daily loan-maintenance pipeline. This single RPC handles:
    //   1. send_payment_reminders — 3-day heads-up to lender + borrower
    //   2. update_overdue_schedules — mark schedules as overdue
    //   3. refresh_risks_and_scores(48) — auto-flag missed payments past the
    //      48h grace period (this is what makes cross-lender visibility work)
    //   4. notify_about_new_auto_flags — lender + borrower notifications for
    //      newly-created SYSTEM_AUTO flags
    //   5. check_loan_defaults — mark loans defaulted at 90+ days late
    const { data: maintenance, error: maintenanceError } = await supabase.rpc(
      'run_daily_loan_maintenance'
    )

    if (maintenanceError) {
      console.error('[CRON] run_daily_loan_maintenance error:', maintenanceError)
      // Non-fatal: continue with the borrower_reports sweep below.
    } else {
      console.log('[CRON] Daily maintenance:', maintenance)
    }

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

    // Find all reports that are:
    // 1. Status = 'unpaid'
    // 2. Due date is more than 7 days ago
    const { data: overdueReports, error: fetchError } = await supabase
      .from('borrower_reports')
      .select(`
        id,
        borrower_id,
        lender_id,
        due_date,
        status,
        borrower:borrowers!borrower_id(
          id,
          full_name,
          user_id
        ),
        lender:lenders!lender_id(
          user_id
        )
      `)
      .eq('status', 'unpaid')
      .not('due_date', 'is', null)
      .lt('due_date', sevenDaysAgoStr) as { data: Array<{
        id: string
        borrower_id: string
        lender_id: string
        due_date: string
        status: string
        borrower: { id: string; full_name: string; user_id: string | null } | null
        lender: { user_id: string } | null
      }> | null, error: any }

    if (fetchError) {
      console.error('[CRON] Error fetching overdue reports:', fetchError)
      throw new Error(`Failed to fetch overdue reports: ${fetchError.message}`)
    }

    console.log(`[CRON] Found ${overdueReports?.length || 0} reports to mark as overdue`)

    let updatedCount = 0
    let notificationsCreated = 0
    const errors: string[] = []

    for (const report of overdueReports || []) {
      try {
        // Update report status to 'overdue'
        const { error: updateError } = await supabase
          .from('borrower_reports')
          .update({
            status: 'overdue',
            updated_at: new Date().toISOString()
          })
          .eq('id', report.id)

        if (updateError) {
          errors.push(`Failed to update report ${report.id}: ${updateError.message}`)
          continue
        }

        updatedCount++

        // Refresh borrower credit score (penalty for overdue)
        const { error: scoreError } = await supabase.rpc('refresh_borrower_score', {
          p_borrower_id: report.borrower_id
        })

        if (scoreError) {
          console.error(`[CRON] Failed to update credit score for borrower ${report.borrower_id}:`, scoreError)
        }

        // Create notification for borrower (if registered)
        if (report.borrower?.user_id) {
          const { error: notifError } = await supabase.rpc('create_notification', {
            p_user_id: report.borrower.user_id,
            p_type: 'payment_due',
            p_title: 'Payment Overdue',
            p_message: `Your payment is now overdue. Please resolve this to avoid further impact on your credit score.`,
            p_link: '/b/reports'
          })

          if (!notifError) {
            notificationsCreated++
          }
        }

        // Create notification for lender
        if (report.lender?.user_id) {
          const { error: lenderNotifError } = await supabase.rpc('create_notification', {
            p_user_id: report.lender.user_id,
            p_type: 'payment_due',
            p_title: 'Report Marked Overdue',
            p_message: `Report for ${report.borrower?.full_name || 'borrower'} has been automatically marked as overdue.`,
            p_link: '/l/reports'
          })

          if (!lenderNotifError) {
            notificationsCreated++
          }
        }

      } catch (error: any) {
        errors.push(`Error processing report ${report.id}: ${error.message}`)
      }
    }

    const result = {
      success: true,
      maintenance: maintenance ?? null,
      reportsChecked: overdueReports?.length || 0,
      reportsUpdated: updatedCount,
      notificationsCreated,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    }

    console.log('[CRON] Overdue check completed:', result)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[CRON] Error in check-overdue-reports:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// For manual testing in development
export async function GET(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'GET method not allowed in production' },
      { status: 405 }
    )
  }

  return POST(req)
}
