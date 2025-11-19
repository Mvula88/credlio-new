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

    // Get loan details
    const { data: loan } = await supabase
      .from('loans')
      .select(`
        *,
        lenders(user_id),
        borrowers(user_id)
      `)
      .eq('id', loanId)
      .single()

    if (!loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404 }
      )
    }

    // Check authorization
    const isLender = loan.lenders?.user_id === user.id
    const isBorrower = loan.borrowers?.user_id === user.id

    if (!isLender && !isBorrower) {
      return NextResponse.json(
        { error: 'Not authorized to update this loan' },
        { status: 403 }
      )
    }

    // Update loan status based on action
    let newStatus = loan.status
    
    if (action === 'approve' && isLender && loan.status === 'requested') {
      newStatus = 'pending' // Pending borrower acceptance
    } else if (action === 'accept' && isBorrower && loan.status === 'pending') {
      newStatus = 'active'
    } else if (action === 'reject') {
      newStatus = 'rejected'
    } else if (action === 'cancel') {
      newStatus = 'cancelled'
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
        { error: error.message },
        { status: 400 }
      )
    }

    // If loan is activated, update first payment due date and generate agreement
    if (newStatus === 'active') {
      const firstDueDate = new Date()
      firstDueDate.setMonth(firstDueDate.getMonth() + 1)

      await supabase
        .from('repayment_schedules')
        .update({ due_date: firstDueDate.toISOString() })
        .eq('loan_id', loanId)
        .eq('payment_number', 1)

      // Generate loan agreement automatically
      try {
        const { error: agreementError } = await supabase
          .rpc('generate_loan_agreement', { p_loan_id: loanId })

        if (agreementError) {
          console.error('Failed to generate loan agreement:', agreementError)
          // Don't fail the loan activation if agreement generation fails
        }
      } catch (agreementErr) {
        console.error('Error generating loan agreement:', agreementErr)
        // Continue with loan activation even if agreement generation fails
      }
    }

    // Send notifications (in production, use a notification service)
    // await sendNotification(...)

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