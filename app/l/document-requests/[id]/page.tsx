'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Mail, User, Clock } from 'lucide-react'

function humanDocType(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Id', 'ID')
}

export default function LenderDocumentRequestDetail() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const supabase = createClient()

  const [row, setRow] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [receivedEmail, setReceivedEmail] = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('document_requests')
      .select('*, borrowers(full_name, phone_e164)')
      .eq('id', id)
      .single()
    setRow(data)
    setReceivedEmail(data?.expected_email ?? '')
    setLoading(false)
  }

  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  const act = async (action: 'confirm_received' | 'reject' | 'cancel') => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/lender/document-requests/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          lender_received_via_email: action === 'confirm_received' ? receivedEmail : undefined,
          lender_decision_notes: decisionNotes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (!row) return <div className="container mx-auto p-8">Request not found.</div>

  const isAwaitingBorrower = ['requested', 'pending_borrower'].includes(row.status)
  const isAwaitingLender = row.status === 'sent_by_borrower'
  const isClosed = ['received', 'rejected', 'cancelled'].includes(row.status)

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/l/document-requests" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Document Verification
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{humanDocType(row.document_type)}</CardTitle>
              <CardDescription>
                From {row.borrowers?.full_name ?? 'borrower'} · created {new Date(row.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {row.request_notes && (
            <Detail icon={Mail} label="Your instructions">
              <p className="text-sm whitespace-pre-wrap">{row.request_notes}</p>
            </Detail>
          )}
          {row.expected_email && (
            <Detail icon={Mail} label="Expected email">
              <p className="text-sm">{row.expected_email}</p>
            </Detail>
          )}
          {row.due_at && (
            <Detail icon={Clock} label="Due">
              <p className="text-sm">{new Date(row.due_at).toLocaleDateString()}</p>
            </Detail>
          )}

          {row.borrower_sent_at && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="font-medium text-sm flex items-center gap-2"><User className="h-4 w-4" /> Borrower's attestation</p>
              <dl className="text-sm space-y-1">
                <dt className="text-muted-foreground">Sent from</dt>
                <dd>{row.borrower_sent_from_email}</dd>
                <dt className="text-muted-foreground">Sent to</dt>
                <dd>{row.borrower_sent_to_email}</dd>
                <dt className="text-muted-foreground">At</dt>
                <dd>{new Date(row.borrower_sent_at).toLocaleString()}</dd>
                {row.borrower_send_notes && (<><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{row.borrower_send_notes}</dd></>)}
              </dl>
            </div>
          )}

          {row.lender_received_at && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="font-medium text-sm">Your decision</p>
              <dl className="text-sm space-y-1">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{row.status === 'received' ? 'Confirmed received' : row.status === 'rejected' ? 'Rejected' : row.status}</dd>
                <dt className="text-muted-foreground">At</dt>
                <dd>{new Date(row.lender_received_at).toLocaleString()}</dd>
                {row.lender_received_via_email && (<><dt className="text-muted-foreground">Received on</dt><dd>{row.lender_received_via_email}</dd></>)}
                {row.lender_decision_notes && (<><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{row.lender_decision_notes}</dd></>)}
              </dl>
            </div>
          )}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          {isAwaitingLender && (
            <div className="space-y-3 pt-2 border-t">
              <p className="font-medium">Confirm or reject</p>
              <div className="space-y-2">
                <Label htmlFor="received-email">Email you received it on</Label>
                <Input id="received-email" type="email" value={receivedEmail} onChange={e => setReceivedEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision-notes">Notes (optional)</Label>
                <Textarea id="decision-notes" rows={2} value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} placeholder="e.g. Statements look authentic, account holder name matches." />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => act('confirm_received')} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Confirm received
                </Button>
                <Button variant="outline" onClick={() => act('reject')} disabled={submitting}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          )}

          {isAwaitingBorrower && !isClosed && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm text-muted-foreground">Borrower hasn't responded yet.</p>
              <Button variant="outline" onClick={() => act('cancel')} disabled={submitting} size="sm">Cancel request</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Detail({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    requested: { label: 'Requested', tone: 'secondary' },
    pending_borrower: { label: 'Awaiting borrower', tone: 'secondary' },
    sent_by_borrower: { label: 'Sent — needs confirmation', tone: 'default' },
    received: { label: 'Received', tone: 'default' },
    rejected: { label: 'Rejected', tone: 'destructive' },
    cancelled: { label: 'Cancelled', tone: 'outline' },
  }
  const m = map[status] ?? map.requested
  return <Badge variant={m.tone}>{m.label}</Badge>
}
