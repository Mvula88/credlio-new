import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Service role client to bypass RLS for credit bureau data
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const borrowerId = searchParams.get('borrowerId')

    if (!borrowerId) {
      return NextResponse.json({ error: 'Borrower ID is required' }, { status: 400 })
    }

    // Verify the requesting user is authenticated and is a lender
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a lender and capture their country for isolation.
    const { data: lender } = await supabase
      .from('lenders')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!lender) {
      return NextResponse.json({ error: 'Only lenders can access this data' }, { status: 403 })
    }

    // Country isolation: this endpoint uses service-role to bypass RLS, so we
    // have to enforce country isolation manually. The lender may only see
    // debt for borrowers in their own country.
    const { data: lenderProfile } = await supabase
      .from('profiles')
      .select('country_code')
      .eq('user_id', user.id)
      .single()

    const lenderCountry = lenderProfile?.country_code
    if (!lenderCountry) {
      return NextResponse.json({ error: 'Lender country not set' }, { status: 403 })
    }

    // Confirm the target borrower is in the lender's country before going further.
    const { data: borrowerRecord } = await supabaseAdmin
      .from('borrowers')
      .select('country_code')
      .eq('id', borrowerId)
      .maybeSingle()

    if (!borrowerRecord || borrowerRecord.country_code !== lenderCountry) {
      // Either the borrower doesn't exist or they're in another country —
      // either way, this lender doesn't get to see their data. Returning
      // 'empty' rather than 404 to avoid revealing whether the ID exists.
      return NextResponse.json({ loans: [], totalMonthlyDebt: 0, loanCount: 0 })
    }

    // Quota: 2 unique borrower checks per month for FREE tier.
    // Re-viewing the same borrower this month is free; PRO/BUSINESS unlimited.
    // Same enforcement pattern as /l/borrowers/page.tsx.
    const { data: quotaResult, error: quotaError } = await supabase.rpc(
      'check_borrower_search_quota',
      { p_user_id: user.id, p_borrower_id: borrowerId }
    )

    if (quotaError) {
      console.error('Quota check error:', quotaError)
      // Fail-open on RPC error — mirrors the existing pattern elsewhere.
    } else if (quotaResult && !quotaResult.allowed) {
      return NextResponse.json(
        {
          error: quotaResult.upgrade_message || 'You have reached your limit of 2 borrowers this month. Upgrade to continue.',
          quotaExceeded: true
        },
        { status: 402 }
      )
    }

    // Use admin client to fetch all loans for this borrower (bypasses RLS for credit bureau)
    // Country isolation enforced via lenderCountry filter below.
    const { data: loans, error: loansError } = await supabaseAdmin
      .from('loans')
      .select('id, principal_amount, principal_minor, outstanding_balance, status, created_at, interest_rate, term_months, total_interest_percent, base_rate_percent, extra_rate_per_installment, num_installments, total_amount_minor, lender_id')
      .eq('borrower_id', borrowerId)
      .eq('country_code', lenderCountry)
      .in('status', ['active', 'pending', 'approved', 'disbursed'])
      .order('created_at', { ascending: false })

    if (loansError) {
      console.error('Error fetching loans:', loansError)
      return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 })
    }

    if (!loans || loans.length === 0) {
      return NextResponse.json({ loans: [], totalMonthlyDebt: 0, loanCount: 0 })
    }

    // Get lender names
    const lenderIds = [...new Set(loans.map(l => l.lender_id))]
    const { data: lenders } = await supabaseAdmin
      .from('lenders')
      .select('user_id, business_name')
      .in('user_id', lenderIds)

    const lenderNames: Record<string, string> = {}
    lenders?.forEach(l => {
      lenderNames[l.user_id] = l.business_name || 'Lender'
    })

    // Flat-interest model matching app/api/loans/create. Prefer the canonical
    // total_amount_minor stored on the loan; otherwise reconstruct from
    // base_rate + extra_rate × (installments - 1).
    const loansWithPayments = loans.map(loan => {
      const principalMinor = (loan.principal_minor ?? loan.principal_amount ?? 0)
      const principal = principalMinor / 100
      const installments = loan.num_installments || loan.term_months || 1
      const baseRate = loan.base_rate_percent ?? loan.interest_rate ?? 15
      const extraRate = loan.extra_rate_per_installment ?? 0
      const totalRate = loan.total_interest_percent ??
        (baseRate + extraRate * Math.max(0, installments - 1))
      const totalAmount = loan.total_amount_minor
        ? loan.total_amount_minor / 100
        : principal + (principal * totalRate / 100)
      const monthlyPayment = installments > 0 ? totalAmount / installments : 0

      return {
        id: loan.id,
        lender_name: lenderNames[loan.lender_id] || 'Lender',
        principal_amount: principal,
        outstanding_balance: (loan.outstanding_balance || principalMinor) / 100,
        monthly_payment: Math.round(monthlyPayment * 100) / 100,
        status: loan.status,
        created_at: loan.created_at
      }
    })

    const totalMonthlyDebt = loansWithPayments.reduce((sum, loan) => sum + loan.monthly_payment, 0)

    return NextResponse.json({
      loans: loansWithPayments,
      totalMonthlyDebt: Math.round(totalMonthlyDebt * 100) / 100,
      loanCount: loansWithPayments.length
    })

  } catch (error) {
    console.error('Error in debt summary API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
