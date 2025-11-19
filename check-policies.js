// Quick test to check if current_user_has_role function works
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://lboiicdewlivkfaqweuv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib2lpY2Rld2xpdmtmYXF3ZXV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTcwNTg1OSwiZXhwIjoyMDcxMjgxODU5fQ.ymIl78hMKaEOZtd9WW-65LU7z4WaRJDZh4aKupt5kfE'
)

async function checkPolicies() {
  // Check if function exists
  const { data: funcData, error: funcError } = await supabase.rpc('current_user_has_role', { p_role: 'lender' })

  console.log('Function test:', { funcData, funcError })

  // Check user roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', 'd122d015-70d3-42db-8a69-87554ad1e33a')

  console.log('User roles:', { roles, rolesError })

  // Try to fetch a borrower
  const { data: borrower, error: borrowerError } = await supabase
    .from('borrowers')
    .select('*')
    .eq('id', '06a9e365-6432-40f9-a9a3-b2f77a4301a5')
    .single()

  console.log('Borrower fetch:', { borrower: borrower?.full_name, borrowerError })
}

checkPolicies().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
