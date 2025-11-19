import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated', details: userError })
  }

  // Check if user has lender record
  const { data: lender, error: lenderError } = await supabase
    .from('lenders')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // Check user roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)

  // Try to query borrowers
  const { data: borrowers, error: borrowersError } = await supabase
    .from('borrowers')
    .select('id, full_name')
    .limit(5)

  // Check if jwt_has_role function works
  const { data: hasLenderRole, error: roleCheckError } = await supabase
    .rpc('jwt_has_role', { p_role: 'lender' })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    lender: lender || null,
    lenderError: lenderError || null,
    roles: roles || [],
    rolesError: rolesError || null,
    borrowers: borrowers || [],
    borrowersError: borrowersError || null,
    hasLenderRole: hasLenderRole,
    roleCheckError: roleCheckError || null,
  })
}
