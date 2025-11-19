import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrencyByCountry } from '@/lib/utils/currency'

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

    const loanData = await req.json()

    // Validate lender
    const { data: lender } = await supabase
      .from('lenders')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!lender) {
      return NextResponse.json(
        { error: 'Only lenders can create loans' },
        { status: 403 }
      )
    }

    // Check if borrower has document verification (anti-fraud measure)
    const { data: borrower } = await supabase
      .from('borrowers')
      .select('*, borrower_verification_summary(*)')
      .eq('id', loanData.borrower_id)
      .single()

    if (!borrower) {
      return NextResponse.json(
        { error: 'Borrower not found' },
        { status: 404 }
      )
    }

    // Check document verification status
    const verification = borrower.borrower_verification_summary

    if (!verification || !verification.verification_complete) {
      return NextResponse.json(
        {
          error: 'DOCUMENT_VERIFICATION_REQUIRED',
          message: 'Borrower must complete document verification before loans can be created',
          borrower_id: borrower.id,
          verification_status: verification?.verification_status || 'pending'
        },
        { status: 400 }
      )
    }

    // Block high-risk borrowers
    if (verification.overall_risk_level === 'high' || verification.requires_manual_review) {
      return NextResponse.json(
        {
          error: 'HIGH_RISK_BORROWER',
          message: 'This borrower has high-risk documents and requires manual review before loan approval',
          borrower_id: borrower.id,
          risk_level: verification.overall_risk_level,
          risk_score: verification.overall_risk_score
        },
        { status: 400 }
      )
    }

    // Warn about medium-risk but allow
    if (verification.overall_risk_level === 'medium') {
      console.warn(`Creating loan for medium-risk borrower ${borrower.id} with risk score ${verification.overall_risk_score}`)
    }

    // Get currency for borrower's country
    const currency = getCurrencyByCountry(borrower.country_code)
    const currencyCode = currency?.code || loanData.currency || 'USD'

    // Create loan using proper schema fields
    const { data: loan, error } = await supabase
      .from('loans')
      .insert({
        lender_id: lender.user_id,
        borrower_id: loanData.borrower_id,
        request_id: loanData.request_id || null,
        country_code: borrower.country_code,
        currency: currencyCode,
        principal_minor: loanData.principal_minor, // Amount in minor units (cents)
        apr_bps: loanData.apr_bps, // APR in basis points (e.g., 1500 = 15%)
        fees_minor: loanData.fees_minor || 0,
        term_months: loanData.term_months,
        start_date: loanData.start_date || new Date().toISOString().split('T')[0],
        status: 'pending',
        purpose: loanData.purpose || ''
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    // Generate repayment schedule using database function
    const { error: scheduleError } = await supabase
      .rpc('generate_repayment_schedule', {
        p_loan_id: loan.id,
        p_principal_minor: loanData.principal_minor,
        p_apr_bps: loanData.apr_bps,
        p_term_months: loanData.term_months,
        p_start_date: loan.start_date
      })

    if (scheduleError) {
      console.error('Error generating repayment schedule:', scheduleError)
      // Don't fail the whole request, but log the error
    }

    return NextResponse.json({ loan })
  } catch (error) {
    console.error('Loan creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create loan' },
      { status: 500 }
    )
  }
}