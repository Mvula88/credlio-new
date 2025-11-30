import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const loanId = '30ae9a03-bb73-47fd-80ce-3c9979c07d31'

async function test() {
  console.log('Testing generate_loan_agreement RPC...')
  
  // First check the loan data
  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .single()
  
  if (loanError) {
    console.error('Error fetching loan:', loanError)
    return
  }
  console.log('Loan data:', JSON.stringify(loan, null, 2))
  
  // Try to generate agreement
  const { data, error } = await supabase.rpc('generate_loan_agreement', { p_loan_id: loanId })
  
  if (error) {
    console.error('RPC Error:', JSON.stringify(error, null, 2))
  } else {
    console.log('Success! Agreement ID:', data)
  }
}

test()
