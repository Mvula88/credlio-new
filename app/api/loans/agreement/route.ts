import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/loans/agreement?loanId=xxx
 * Generates or retrieves loan agreement and returns HTML for download
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get loan ID from query params
  const searchParams = request.nextUrl.searchParams
  const loanId = searchParams.get('loanId')

  if (!loanId) {
    return NextResponse.json({ error: 'Loan ID is required' }, { status: 400 })
  }

  try {
    // Verify user has access to this loan (either lender or borrower)
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('lender_id, borrower_id')
      .eq('id', loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    // Check if user is the lender
    const isLender = loan.lender_id === user.id

    // Check if user is the borrower (via borrower_user_links)
    const { data: borrowerLink } = await supabase
      .from('borrower_user_links')
      .select('borrower_id')
      .eq('user_id', user.id)
      .eq('borrower_id', loan.borrower_id)
      .single()

    const isBorrower = !!borrowerLink

    // User must be either lender or borrower
    if (!isLender && !isBorrower) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only access agreements for your own loans' },
        { status: 403 }
      )
    }

    // First check if agreement already exists
    const { data: existingAgreement, error: fetchError } = await supabase
      .from('loan_agreements')
      .select('*')
      .eq('loan_id', loanId)
      .single()

    let agreement = existingAgreement

    // If not exists, generate it
    if (!existingAgreement) {
      console.log('No existing agreement, generating new one for loan:', loanId)
      const { data: agreementId, error: generateError } = await supabase
        .rpc('generate_loan_agreement', { p_loan_id: loanId })

      if (generateError) {
        console.error('Error generating agreement:', JSON.stringify(generateError, null, 2))
        return NextResponse.json(
          { error: 'Failed to generate loan agreement', details: generateError.message, code: generateError.code, hint: generateError.hint },
          { status: 500 }
        )
      }
      console.log('Agreement generated with ID:', agreementId)

      // Fetch the newly generated agreement
      const { data: newAgreement, error: newFetchError } = await supabase
        .from('loan_agreements')
        .select('*')
        .eq('id', agreementId)
        .single()

      if (newFetchError || !newAgreement) {
        return NextResponse.json(
          { error: 'Failed to fetch generated agreement' },
          { status: 500 }
        )
      }

      agreement = newAgreement
    }

    if (!agreement) {
      return NextResponse.json(
        { error: 'Agreement not found' },
        { status: 404 }
      )
    }

    // Update download tracking based on user role
    if (isLender) {
      // Update lender download timestamp
      await supabase
        .from('loan_agreements')
        .update({ lender_downloaded_at: new Date().toISOString() })
        .eq('loan_id', loanId)
    } else if (isBorrower) {
      // Update borrower download timestamp
      await supabase
        .from('loan_agreements')
        .update({ borrower_downloaded_at: new Date().toISOString() })
        .eq('loan_id', loanId)
    }

    // Return HTML for download
    return new NextResponse(agreement.agreement_html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="loan-agreement-${loanId}.html"`,
      },
    })
  } catch (error: any) {
    console.error('Error in loan agreement API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/loans/agreement
 * Manually triggers agreement generation for a loan
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { loanId } = await request.json()

  if (!loanId) {
    return NextResponse.json({ error: 'Loan ID is required' }, { status: 400 })
  }

  try {
    // Verify user has access to this loan (either lender or borrower)
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('lender_id, borrower_id')
      .eq('id', loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    // Check if user is the lender
    const isLender = loan.lender_id === user.id

    // Check if user is the borrower (via borrower_user_links)
    const { data: borrowerLink } = await supabase
      .from('borrower_user_links')
      .select('borrower_id')
      .eq('user_id', user.id)
      .eq('borrower_id', loan.borrower_id)
      .single()

    const isBorrower = !!borrowerLink

    // User must be either lender or borrower
    if (!isLender && !isBorrower) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only generate agreements for your own loans' },
        { status: 403 }
      )
    }

    // Check if agreement already exists
    const { data: existingAgreement } = await supabase
      .from('loan_agreements')
      .select('id')
      .eq('loan_id', loanId)
      .single()

    if (existingAgreement) {
      return NextResponse.json({
        message: 'Agreement already exists',
        agreementId: existingAgreement.id
      })
    }

    // Generate new agreement
    const { data: agreementId, error: generateError } = await supabase
      .rpc('generate_loan_agreement', { p_loan_id: loanId })

    if (generateError) {
      console.error('Error generating agreement:', generateError)
      return NextResponse.json(
        { error: 'Failed to generate loan agreement', details: generateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Agreement generated successfully',
      agreementId
    })
  } catch (error: any) {
    console.error('Error in loan agreement generation:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
