import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (has full access)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log('Starting overdue reports check...')

    // Find all reports that are:
    // 1. Status = 'unpaid'
    // 2. Due date is more than 7 days ago
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: overdueReports, error: fetchError } = await supabaseClient
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
      .lt('due_date', sevenDaysAgo.toISOString().split('T')[0])

    if (fetchError) {
      throw new Error(`Failed to fetch overdue reports: ${fetchError.message}`)
    }

    console.log(`Found ${overdueReports?.length || 0} reports to mark as overdue`)

    let updatedCount = 0
    let notificationsCreated = 0

    for (const report of overdueReports || []) {
      try {
        // Update report status to 'overdue'
        const { error: updateError } = await supabaseClient
          .from('borrower_reports')
          .update({
            status: 'overdue',
            updated_at: new Date().toISOString()
          })
          .eq('id', report.id)

        if (updateError) {
          console.error(`Failed to update report ${report.id}:`, updateError.message)
          continue
        }

        updatedCount++

        // Refresh borrower credit score (penalty for overdue)
        const { error: scoreError } = await supabaseClient.rpc('refresh_borrower_score', {
          p_borrower_id: report.borrower_id
        })

        if (scoreError) {
          console.error(`Failed to update credit score for borrower ${report.borrower_id}:`, scoreError.message)
        }

        // Create notification for borrower (if registered)
        if (report.borrower?.user_id) {
          const { error: notifError } = await supabaseClient.rpc('create_notification', {
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
        const { error: lenderNotifError } = await supabaseClient.rpc('create_notification', {
          p_user_id: report.lender.user_id,
          p_type: 'payment_due',
          p_title: 'Report Marked Overdue',
          p_message: `Report for ${report.borrower?.full_name || 'borrower'} has been automatically marked as overdue.`,
          p_link: '/l/reports'
        })

        if (!lenderNotifError) {
          notificationsCreated++
        }

      } catch (error) {
        console.error(`Error processing report ${report.id}:`, error)
      }
    }

    const result = {
      success: true,
      reportsChecked: overdueReports?.length || 0,
      reportsUpdated: updatedCount,
      notificationsCreated,
      timestamp: new Date().toISOString()
    }

    console.log('Overdue check completed:', result)

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error in check-overdue-reports function:', error)

    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
