'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DebugVerificationsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        // Simple query
        const { data: simpleData, error: simpleError } = await supabase
          .from('borrower_self_verification_status')
          .select('*')

        console.log('Simple query:', { simpleData, simpleError })

        // Complex query
        const { data: complexData, error: complexError } = await supabase
          .from('borrower_self_verification_status')
          .select(`
            *,
            borrowers!borrower_self_verification_status_borrower_id_fkey (
              id,
              full_name,
              phone_e164,
              country_code
            )
          `)

        console.log('Complex query:', { complexData, complexError })

        // Check borrower documents
        const { data: docsData, error: docsError } = await supabase
          .from('borrower_documents')
          .select('*')

        console.log('Documents query:', { docsData, docsError })

        // Get all borrowers
        const { data: borrowersData, error: borrowersError } = await supabase
          .from('borrowers')
          .select('*')

        console.log('Borrowers query:', { borrowersData, borrowersError })

        // Get all profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')

        console.log('Profiles query:', { profilesData, profilesError })

        // Get all borrower_user_links
        const { data: linksData, error: linksError } = await supabase
          .from('borrower_user_links')
          .select('*')

        console.log('Links query:', { linksData, linksError })

        setData({
          simple: simpleData,
          complex: complexData,
          documents: docsData,
          borrowers: borrowersData,
          profiles: profilesData,
          links: linksData
        })

        if (simpleError || complexError) {
          setError({
            simple: simpleError,
            complex: complexError
          })
        }
      } catch (err) {
        setError(err)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Verifications</h1>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Simple Query Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.simple, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Complex Query Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.complex, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Borrower Documents:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.documents, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold">All Borrowers:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.borrowers, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold">All Profiles:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.profiles, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Borrower-User Links:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data?.links, null, 2)}
          </pre>
        </div>

        {error && (
          <div>
            <h2 className="text-xl font-semibold text-red-600">Errors:</h2>
            <pre className="bg-red-100 p-4 rounded overflow-auto">
              {JSON.stringify(error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
