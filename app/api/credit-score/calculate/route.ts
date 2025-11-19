import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreditFactors {
  payment_history: number
  credit_utilization: number
  credit_age: number
  credit_mix: number
  new_inquiries: number
}

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

    const { borrowerId } = await req.json()

    // Get borrower data
    const { data: borrower } = await supabase
      .from('borrowers')
      .select(`
        *,
        loans(
          *,
          repayment_schedules(*),
          repayment_events(*)
        )
      `)
      .eq('id', borrowerId || user.id)
      .single()

    if (!borrower) {
      return NextResponse.json(
        { error: 'Borrower not found' },
        { status: 404 }
      )
    }

    // Calculate credit score based on various factors
    const creditScore = calculateCreditScore(borrower)

    // Save or update credit score
    const { data: existingScore } = await supabase
      .from('borrower_scores')
      .select('*')
      .eq('borrower_id', borrower.id)
      .single()

    if (existingScore) {
      await supabase
        .from('borrower_scores')
        .update({
          score: creditScore.score,
          factors: creditScore.factors,
          updated_at: new Date().toISOString()
        })
        .eq('borrower_id', borrower.id)
    } else {
      await supabase
        .from('borrower_scores')
        .insert({
          borrower_id: borrower.id,
          score: creditScore.score,
          factors: creditScore.factors
        })
    }

    return NextResponse.json({ creditScore })
  } catch (error) {
    console.error('Credit score calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate credit score' },
      { status: 500 }
    )
  }
}

function calculateCreditScore(borrower: any): { score: number; factors: CreditFactors } {
  let baseScore = 650 // Starting score
  const factors: CreditFactors = {
    payment_history: 35,
    credit_utilization: 30,
    credit_age: 15,
    credit_mix: 10,
    new_inquiries: 10
  }

  // Payment History (35% of score)
  let paymentHistoryScore = 0
  if (borrower.loans && borrower.loans.length > 0) {
    const totalPayments = borrower.loans.reduce((sum: number, loan: any) => {
      return sum + (loan.repayment_events?.length || 0)
    }, 0)
    
    const onTimePayments = borrower.loans.reduce((sum: number, loan: any) => {
      return sum + (loan.repayment_events?.filter((p: any) => {
        const schedule = loan.repayment_schedules?.find((s: any) => s.id === p.schedule_id)
        return schedule && new Date(p.created_at) <= new Date(schedule.due_date)
      }).length || 0)
    }, 0)

    if (totalPayments > 0) {
      const onTimeRate = onTimePayments / totalPayments
      paymentHistoryScore = onTimeRate * factors.payment_history * 8.5 // Max 297.5 points
    }
  }

  // Credit Utilization (30% of score)
  let utilizationScore = 0
  const creditLimit = borrower.credit_limit || 100000
  const currentDebt = borrower.loans?.filter((l: any) => l.status === 'active')
    .reduce((sum: number, loan: any) => sum + (loan.total_amount - loan.total_repaid), 0) || 0
  
  const utilizationRate = currentDebt / creditLimit
  if (utilizationRate <= 0.3) {
    utilizationScore = factors.credit_utilization * 8.5 // Max 255 points
  } else if (utilizationRate <= 0.5) {
    utilizationScore = factors.credit_utilization * 6
  } else if (utilizationRate <= 0.7) {
    utilizationScore = factors.credit_utilization * 4
  } else {
    utilizationScore = factors.credit_utilization * 2
  }

  // Credit Age (15% of score)
  let creditAgeScore = 0
  const accountAge = new Date().getTime() - new Date(borrower.created_at).getTime()
  const yearsActive = accountAge / (1000 * 60 * 60 * 24 * 365)
  
  if (yearsActive >= 5) {
    creditAgeScore = factors.credit_age * 8.5 // Max 127.5 points
  } else if (yearsActive >= 3) {
    creditAgeScore = factors.credit_age * 6
  } else if (yearsActive >= 1) {
    creditAgeScore = factors.credit_age * 4
  } else {
    creditAgeScore = factors.credit_age * 2
  }

  // Credit Mix (10% of score)
  let creditMixScore = 0
  const loanTypes = new Set(borrower.loans?.map((l: any) => l.purpose) || [])
  
  if (loanTypes.size >= 3) {
    creditMixScore = factors.credit_mix * 8.5 // Max 85 points
  } else if (loanTypes.size >= 2) {
    creditMixScore = factors.credit_mix * 6
  } else {
    creditMixScore = factors.credit_mix * 3
  }

  // New Inquiries (10% of score)
  let inquiriesScore = factors.new_inquiries * 8.5 // Start with max 85 points
  const recentLoans = borrower.loans?.filter((l: any) => {
    const loanAge = new Date().getTime() - new Date(l.created_at).getTime()
    return loanAge < (90 * 24 * 60 * 60 * 1000) // Last 90 days
  }).length || 0
  
  if (recentLoans > 3) {
    inquiriesScore = factors.new_inquiries * 2
  } else if (recentLoans > 1) {
    inquiriesScore = factors.new_inquiries * 5
  }

  // Calculate final score
  const totalScore = Math.round(
    baseScore + 
    paymentHistoryScore + 
    utilizationScore + 
    creditAgeScore + 
    creditMixScore + 
    inquiriesScore
  )

  // Cap between 300 and 850
  const finalScore = Math.max(300, Math.min(850, totalScore))

  return {
    score: finalScore,
    factors
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get borrower's credit score
    const { data: borrower } = await supabase
      .from('borrowers')
      .select(`
        *,
        borrower_scores(*)
      `)
      .eq('user_id', user.id)
      .single()

    if (!borrower) {
      return NextResponse.json(
        { error: 'Borrower not found' },
        { status: 404 }
      )
    }

    const creditScore = borrower.borrower_scores?.[0] || {
      score: 650,
      factors: {
        payment_history: 35,
        credit_utilization: 30,
        credit_age: 15,
        credit_mix: 10,
        new_inquiries: 10
      }
    }

    return NextResponse.json({ creditScore })
  } catch (error) {
    console.error('Credit score fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch credit score' },
      { status: 500 }
    )
  }
}