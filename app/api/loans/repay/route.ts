import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { loanId, amount, paymentMethod } = await req.json()

    if (!loanId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Loan ID and a positive amount are required' },
        { status: 400 }
      )
    }

    // Call the database RPC function which handles everything:
    // - Validates loan exists and is active
    // - Verifies caller is the lender
    // - Applies payment to oldest unpaid schedules (FIFO)
    // - Updates schedule statuses (paid/partial)
    // - Updates loan total_repaid
    // - Marks loan as completed if fully paid
    // - Sends notifications to both parties
    // - Updates borrower credit score on completion
    const { data, error } = await supabase
      .rpc('process_repayment', {
        p_loan_id: loanId,
        p_amount: amount
      })

    if (error) {
      console.error('Repayment processing error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to process repayment' },
        { status: 400 }
      )
    }

    // Also record in repayment_events for audit trail
    // Get the first unpaid/recently-paid schedule for this loan
    const { data: schedule } = await supabase
      .from('repayment_schedules')
      .select('id')
      .eq('loan_id', loanId)
      .in('status', ['paid', 'partial', 'pending', 'overdue'])
      .order('installment_no', { ascending: true })
      .limit(1)
      .single()

    if (schedule) {
      await supabase
        .from('repayment_events')
        .insert({
          schedule_id: schedule.id,
          paid_at: new Date().toISOString(),
          amount_paid_minor: Math.round(amount * 100),
          method: paymentMethod || 'cash',
          reference_number: `PAY-${Date.now()}`,
          reported_by: user.id
        })
    }

    return NextResponse.json({
      success: true,
      ...data
    })
  } catch (error) {
    console.error('Repayment error:', error)
    return NextResponse.json(
      { error: 'Failed to process repayment' },
      { status: 500 }
    )
  }
}
