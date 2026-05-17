import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_DOC_TYPES = new Set([
  'national_id', 'passport', 'proof_of_address', 'bank_statement', 'payslip',
  'employment_letter', 'business_registration', 'tax_clearance', 'reference_letter',
])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm caller is a lender
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'lender')
    .maybeSingle()
  if (!roleRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    borrower_id,
    document_type,
    request_notes,
    expected_email,
    due_at,
    loan_request_id,
    loan_offer_id,
    loan_id,
  } = body

  if (!borrower_id || !document_type) {
    return NextResponse.json({ error: 'borrower_id and document_type are required' }, { status: 400 })
  }
  if (!ALLOWED_DOC_TYPES.has(document_type)) {
    return NextResponse.json({ error: 'Invalid document_type' }, { status: 400 })
  }

  // Look up the borrower's user_id — we need it for RLS so the borrower can
  // see and respond to the request.
  const { data: link } = await supabase
    .from('borrower_user_links')
    .select('user_id')
    .eq('borrower_id', borrower_id)
    .maybeSingle()
  if (!link) {
    return NextResponse.json({ error: 'Borrower has no linked user account' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('document_requests')
    .insert({
      lender_id: user.id,
      borrower_id,
      borrower_user_id: link.user_id,
      document_type,
      request_notes: request_notes ?? null,
      expected_email: expected_email ?? null,
      due_at: due_at ?? null,
      loan_request_id: loan_request_id ?? null,
      loan_offer_id: loan_offer_id ?? null,
      loan_id: loan_id ?? null,
      status: 'pending_borrower',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: data.id }, { status: 201 })
}
