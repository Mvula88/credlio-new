import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processLoanRepayment } from '@/lib/stripe/server'

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

    const { 
      loanId, 
      scheduleId, 
      amount, 
      paymentMethodId 
    } = await req.json()

    // Get loan and schedule details
    const { data: schedule } = await supabase
      .from('repayment_schedules')
      .select(`
        *,
        loans(
          *,
          borrowers(user_id, profiles(stripe_customer_id))
        )
      `)
      .eq('id', scheduleId)
      .eq('loan_id', loanId)
      .single()

    if (!schedule) {
      return NextResponse.json(
        { error: 'Payment schedule not found' },
        { status: 404 }
      )
    }

    // Verify borrower
    if (schedule.loans.borrowers.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to make this payment' },
        { status: 403 }
      )
    }

    // Process payment through Stripe
    if (paymentMethodId) {
      try {
        const paymentIntent = await processLoanRepayment(
          amount,
          schedule.loans.currency,
          schedule.loans.borrowers.profiles.stripe_customer_id,
          loanId,
          paymentMethodId
        )

        if (paymentIntent.status !== 'succeeded') {
          return NextResponse.json(
            { error: 'Payment failed' },
            { status: 400 }
          )
        }
      } catch (stripeError) {
        console.error('Stripe payment error:', stripeError)
        return NextResponse.json(
          { error: 'Payment processing failed' },
          { status: 400 }
        )
      }
    }

    // Record payment event
    const { data: paymentEvent, error: paymentError } = await supabase
      .from('repayment_events')
      .insert({
        loan_id: loanId,
        schedule_id: scheduleId,
        amount: amount,
        principal_amount: schedule.principal_amount,
        interest_amount: schedule.interest_amount,
        status: 'completed',
        payment_method: paymentMethodId ? 'stripe' : 'manual',
        transaction_reference: `PAY-${Date.now()}`
      })
      .select()
      .single()

    if (paymentError) {
      return NextResponse.json(
        { error: paymentError.message },
        { status: 400 }
      )
    }

    // Update schedule status
    await supabase
      .from('repayment_schedules')
      .update({ 
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', scheduleId)

    // Update loan total repaid
    const newTotalRepaid = schedule.loans.total_repaid + amount
    const isFullyPaid = newTotalRepaid >= schedule.loans.total_amount

    await supabase
      .from('loans')
      .update({ 
        total_repaid: newTotalRepaid,
        status: isFullyPaid ? 'completed' : 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', loanId)

    // Update borrower credit score (simplified)
    await updateCreditScore(schedule.loans.borrowers.user_id, 'on_time_payment')

    return NextResponse.json({ 
      success: true,
      paymentEvent,
      fullyPaid: isFullyPaid
    })
  } catch (error) {
    console.error('Repayment error:', error)
    return NextResponse.json(
      { error: 'Failed to process repayment' },
      { status: 500 }
    )
  }
}

async function updateCreditScore(userId: string, event: string) {
  const supabase = await createClient()
  
  // Get current score
  const { data: borrower } = await supabase
    .from('borrowers')
    .select('id, borrower_scores(*)')
    .eq('user_id', userId)
    .single()

  if (!borrower) return

  const currentScore = borrower.borrower_scores?.[0]?.score || 650
  let newScore = currentScore

  // Simple credit score calculation
  switch (event) {
    case 'on_time_payment':
      newScore = Math.min(850, currentScore + 5)
      break
    case 'late_payment':
      newScore = Math.max(300, currentScore - 20)
      break
    case 'missed_payment':
      newScore = Math.max(300, currentScore - 50)
      break
  }

  // Update or create score
  if (borrower.borrower_scores?.[0]) {
    await supabase
      .from('borrower_scores')
      .update({ 
        score: newScore,
        updated_at: new Date().toISOString()
      })
      .eq('borrower_id', borrower.id)
  } else {
    await supabase
      .from('borrower_scores')
      .insert({
        borrower_id: borrower.id,
        score: newScore,
        factors: {
          payment_history: 35,
          credit_utilization: 30,
          credit_age: 15,
          credit_mix: 10,
          new_inquiries: 10
        }
      })
  }
}