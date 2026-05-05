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

    const { loanId, action } = await req.json()

    // Get loan details with lender and borrower links
    const { data: loan } = await supabase
      .from('loans')
      .select(`
        *,
        lenders(user_id),
        borrowers(
          id,
          borrower_user_links(user_id)
        )
      `)
      .eq('id', loanId)
      .single()

    if (!loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404 }
      )
    }

    // Check authorization - lender via lenders table, borrower via borrower_user_links
    const isLender = loan.lenders?.user_id === user.id
    const isBorrower = loan.borrowers?.borrower_user_links?.some(
      (link: { user_id: string }) => link.user_id === user.id
    ) ?? false

    if (!isLender && !isBorrower) {
      return NextResponse.json(
        { error: 'Not authorized to update this loan' },
        { status: 403 }
      )
    }

    // Update loan status based on action
    // Valid statuses in enum: active, completed, defaulted, written_off, pending_offer, declined
    let newStatus = loan.status

    if (action === 'accept' && isBorrower && loan.status === 'pending_offer') {
      // Borrower accepts the loan offer
      newStatus = 'active'
    } else if (action === 'decline' && isBorrower && loan.status === 'pending_offer') {
      // Borrower declines the loan offer
      newStatus = 'declined'
    } else if (action === 'cancel' && isLender && loan.status === 'pending_offer') {
      // Lender cancels pending offer (revert to written_off since there's no cancelled status)
      newStatus = 'written_off'
    } else {
      return NextResponse.json(
        { error: `Invalid action '${action}' for loan status '${loan.status}'` },
        { status: 400 }
      )
    }

    // Update loan
    const { error } = await supabase
      .from('loans')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', loanId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update loan status' },
        { status: 400 }
      )
    }

    // If loan is activated, set first payment due date and generate agreement
    if (newStatus === 'active') {
      const firstDueDate = new Date()
      firstDueDate.setMonth(firstDueDate.getMonth() + 1)

      await supabase
        .from('repayment_schedules')
        .update({ due_date: firstDueDate.toISOString() })
        .eq('loan_id', loanId)
        .eq('installment_no', 1)

      // Generate loan agreement automatically
      try {
        await supabase.rpc('generate_loan_agreement', { p_loan_id: loanId })
      } catch (agreementErr) {
        console.error('Error generating loan agreement:', agreementErr)
      }

      // Notify lender that borrower accepted
      await supabase
        .from('notifications')
        .insert({
          user_id: loan.lenders?.user_id,
          type: 'loan_accepted',
          title: 'Loan Offer Accepted',
          message: 'Your loan offer has been accepted by the borrower.',
          link: `/l/loans/${loanId}`,
          target_role: 'lender'
        })
    }

    // If loan was declined, notify lender
    if (newStatus === 'declined') {
      await supabase
        .from('notifications')
        .insert({
          user_id: loan.lenders?.user_id,
          type: 'loan_declined',
          title: 'Loan Offer Declined',
          message: 'Your loan offer has been declined by the borrower.',
          link: `/l/loans/${loanId}`,
          target_role: 'lender'
        })
    }

    return NextResponse.json({
      success: true,
      status: newStatus
    })
  } catch (error) {
    console.error('Loan approval error:', error)
    return NextResponse.json(
      { error: 'Failed to process loan' },
      { status: 500 }
    )
  }
}
