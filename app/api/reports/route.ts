import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reports
 * Fetch reports based on user role (multi-role system):
 * - Lenders: their own reports + premium lenders see all in country
 * - Borrowers: reports about them
 * - Admins: all reports
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const borrowerId = searchParams.get('borrowerId')
    const status = searchParams.get('status')

    // Get user roles (multi-role system)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    if (!userRoles || userRoles.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const roles = userRoles.map(r => r.role)

    let query = supabase
      .from('borrower_reports')
      .select(`
        *,
        borrower:borrowers!borrower_id(
          id,
          full_name,
          phone_e164,
          country_code
        ),
        lender:lenders!lender_id(
          user_id,
          business_name
        )
      `)
      .order('created_at', { ascending: false })

    // Apply filters based on role
    if (roles.includes('lender')) {
      // Lenders see their own reports (RLS handles premium visibility)
      query = query.eq('lender_id', user.id)
    } else if (roles.includes('borrower')) {
      // Borrowers see reports about them - query through junction table
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        return NextResponse.json({ error: 'Borrower record not found' }, { status: 404 })
      }

      query = query.eq('borrower_id', linkData.borrower_id)
    }
    // Admins see all (no additional filter needed, RLS handles it)

    // Apply additional filters
    if (borrowerId) {
      query = query.eq('borrower_id', borrowerId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: reports, error } = await query

    if (error) {
      console.error('Error fetching reports:', error)
      return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
    }

    return NextResponse.json({ reports })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/reports
 * File a new report on a borrower (lender only)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a lender (multi-role system)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const roles = userRoles?.map(r => r.role) || []

    if (!roles.includes('lender')) {
      return NextResponse.json({ error: 'Only lenders can file reports' }, { status: 403 })
    }

    const body = await req.json()
    const {
      borrowerId,
      amount,
      loanDate,
      dueDate,
      status,
      description,
      evidenceUrls
    } = body

    // Validate required fields
    if (!borrowerId || !amount || !loanDate || !status) {
      return NextResponse.json({
        error: 'Missing required fields: borrowerId, amount, loanDate, status'
      }, { status: 400 })
    }

    // Validate status
    const validStatuses = ['unpaid', 'paid', 'disputed', 'overdue']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 })
    }

    // Convert amount to minor units (cents)
    const amountMinor = Math.round(amount * 100)

    // Call database function to file report
    const { data: reportId, error } = await supabase.rpc('file_borrower_report', {
      p_borrower_id: borrowerId,
      p_amount_minor: amountMinor,
      p_loan_date: loanDate,
      p_due_date: dueDate || null,
      p_status: status,
      p_description: description || null,
      p_evidence_urls: evidenceUrls || null
    })

    if (error) {
      console.error('Error filing report:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch the created report
    const { data: report } = await supabase
      .from('borrower_reports')
      .select(`
        *,
        borrower:borrowers!borrower_id(
          id,
          full_name,
          phone_e164
        )
      `)
      .eq('id', reportId)
      .single()

    return NextResponse.json({
      success: true,
      report
    }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/reports
 * Update a report (confirm payment or dispute)
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { reportId, action, paymentDate, response } = body

    if (!reportId || !action) {
      return NextResponse.json({
        error: 'Missing required fields: reportId, action'
      }, { status: 400 })
    }

    let result

    if (action === 'confirm_payment') {
      if (!paymentDate) {
        return NextResponse.json({
          error: 'Payment date is required for confirmation'
        }, { status: 400 })
      }

      const { data, error } = await supabase.rpc('confirm_report_payment', {
        p_report_id: reportId,
        p_payment_date: paymentDate,
        p_response: response || null
      })

      if (error) {
        console.error('Error confirming payment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      result = data
    } else if (action === 'dispute') {
      if (!response) {
        return NextResponse.json({
          error: 'Response is required for dispute'
        }, { status: 400 })
      }

      const { data, error } = await supabase.rpc('dispute_report', {
        p_report_id: reportId,
        p_response: response
      })

      if (error) {
        console.error('Error disputing report:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      result = data
    } else {
      return NextResponse.json({
        error: 'Invalid action. Must be "confirm_payment" or "dispute"'
      }, { status: 400 })
    }

    // Fetch updated report
    const { data: report } = await supabase
      .from('borrower_reports')
      .select('*')
      .eq('id', reportId)
      .single()

    return NextResponse.json({
      success: true,
      report
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
