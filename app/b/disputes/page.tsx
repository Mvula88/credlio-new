'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, FileText, Loader2, Plus } from 'lucide-react'
import { format } from 'date-fns'

interface Dispute {
  id: string
  type: string
  title: string | null
  description: string
  status: string
  outcome: string | null
  resolution_notes: string | null
  created_at: string
  resolved_at: string | null
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  under_review: 'secondary',
  resolved: 'outline',
  rejected: 'destructive',
}

export default function BorrowerDisputesPage() {
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
        router.push('/b/login')
        return
      }

      const { data, error: queryError } = await supabase
        .from('disputes')
        .select('id, type, title, description, status, outcome, resolution_notes, created_at, resolved_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(queryError.message)
        return
      }

      setDisputes(data || [])
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
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Disputes</h1>
          <p className="text-muted-foreground mt-1">
            Challenge incorrect loan information or risk flags on your record.
          </p>
        </div>
        <Button asChild>
          <Link href="/b/disputes/new">
            <Plus className="h-4 w-4 mr-2" />
            File a Dispute
          </Link>
        </Button>
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
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No disputes yet</h3>
            <p className="text-muted-foreground mb-4">
              If a lender has flagged you incorrectly, or your payment was not recorded, you can file a dispute.
            </p>
            <Button asChild>
              <Link href="/b/disputes/new">File your first dispute</Link>
            </Button>
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
                      Filed {format(new Date(dispute.created_at), 'MMM d, yyyy')}
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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                  {dispute.description}
                </p>
                {dispute.resolution_notes && (
                  <Alert className="mt-4">
                    <AlertDescription>
                      <strong>Resolution:</strong> {dispute.resolution_notes}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
