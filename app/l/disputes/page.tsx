'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Scale, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Dispute {
  id: string
  borrower_id: string
  loan_id: string | null
  type: string
  title: string | null
  description: string
  status: string
  outcome: string | null
  resolution_notes: string | null
  created_at: string
  resolved_at: string | null
  borrower?: { full_name: string | null } | null
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  under_review: 'secondary',
  resolved: 'outline',
  rejected: 'destructive',
}

export default function LenderDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadDisputes()
  }, [])

  const loadDisputes = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // Disputes a lender should see:
      //  - disputes directly against them (lender_id = user.id)
      //  - disputes about a loan they made
      //  - disputes about a risk flag they filed
      // RLS handles country isolation; this just narrows to lender-relevant ones.
      const { data: loanIds } = await supabase
        .from('loans')
        .select('id')
        .eq('lender_id', user.id)

      const loanIdList = (loanIds || []).map((l: { id: string }) => l.id)

      let query = supabase
        .from('disputes')
        .select(`
          id, borrower_id, loan_id, type, title, description, status,
          outcome, resolution_notes, created_at, resolved_at,
          borrower:borrowers!borrower_id(full_name)
        `)
        .order('created_at', { ascending: false })

      // Filter: lender_id matches, or loan_id is one of this lender's loans
      if (loanIdList.length > 0) {
        query = query.or(`lender_id.eq.${user.id},loan_id.in.(${loanIdList.join(',')})`)
      } else {
        query = query.eq('lender_id', user.id)
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setError(queryError.message)
        return
      }

      setDisputes((data as unknown as Dispute[]) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load disputes')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Scale className="h-7 w-7" />
          Disputes
        </h1>
        <p className="text-muted-foreground mt-1">
          Disputes filed by borrowers about loans you made or flags you raised. Credlio admin reviews and resolves each one.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {disputes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No disputes against you</h3>
            <p className="text-muted-foreground">
              Borrowers can file disputes if they believe a loan or flag is incorrect. When that happens, it will appear here for your reference.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <Card key={dispute.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      {dispute.title || dispute.type.replace(/_/g, ' ')}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Filed by {dispute.borrower?.full_name || 'borrower'} on {format(new Date(dispute.created_at), 'MMM d, yyyy')}
                      {dispute.resolved_at && (
                        <> · Resolved {format(new Date(dispute.resolved_at), 'MMM d, yyyy')}</>
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANT[dispute.status] || 'default'}>
                    {dispute.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {dispute.description}
                </p>
                {dispute.resolution_notes && (
                  <Alert className="mt-4">
                    <AlertDescription>
                      <strong>Resolution:</strong> {dispute.resolution_notes}
                      {dispute.outcome && (
                        <span className="block mt-1">
                          <strong>Outcome:</strong> {dispute.outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="mt-4 text-xs text-muted-foreground">
                  Status updates are handled by Credlio admin. If you need to add information, contact support.
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
