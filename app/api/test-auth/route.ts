import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated', userError }, { status: 401 })
  }

  // Check user roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  // Try to fetch a borrower
  const { data: borrower, error: borrowerError } = await supabase
    .from('borrowers')
    .select('id, full_name')
    .limit(1)
    .single()

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    appMetadata: user.app_metadata,
    roles: roles?.map(r => r.role),
    rolesError,
    borrower: borrower?.full_name,
    borrowerError: borrowerError ? {
      message: borrowerError.message,
      code: borrowerError.code,
      details: borrowerError.details,
      hint: borrowerError.hint
    } : null
  })
}
