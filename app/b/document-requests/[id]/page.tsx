'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ArrowLeft, Loader2, Send, Mail, Info, ShieldCheck, AlertTriangle } from 'lucide-react'

function humanDocType(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Id', 'ID')
}

export default function BorrowerDocumentRequestDetail() {
  const params = useParams()
  const id = params?.id as string
  const supabase = createClient()

  const [row, setRow] = useState<any>(null)
  const [lenderName, setLenderName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [myEmail, setMyEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) setMyEmail(user.email)

    const { data } = await supabase
      .from('document_requests')
      .select('*')
      .eq('id', id)
      .single()
    setRow(data)
    setSentTo(data?.expected_email ?? '')

    if (data?.lender_id) {
      const { data: lender } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', data.lender_id)
        .single()
      setLenderName(lender?.full_name ?? lender?.email ?? 'The lender')
    }
    setLoading(false)
  }

  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  const markSent = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/borrower/document-requests/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          borrower_sent_from_email: myEmail,
          borrower_sent_to_email: sentTo,
          borrower_send_notes: notes || null,
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

  const canMarkSent = ['requested', 'pending_borrower'].includes(row.status)

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Link href="/b/document-requests" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> All requests
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{humanDocType(row.document_type)}</CardTitle>
              <CardDescription>Requested by {lenderName} · {new Date(row.created_at).toLocaleDateString()}</CardDescription>
            </div>
            <Badge variant={row.status === 'received' ? 'default' : row.status === 'rejected' ? 'destructive' : 'secondary'}>
              {row.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {row.request_notes && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Instructions from {lenderName}</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{row.request_notes}</AlertDescription>
            </Alert>
          )}

          {row.expected_email && (
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Mail className="h-3 w-3" /> Send the document to</p>
              <p className="text-lg font-mono">{row.expected_email}</p>
              <p className="text-xs text-muted-foreground">Email the file directly to this address from your own email.</p>
            </div>
          )}

          {canMarkSent ? (
            <form onSubmit={markSent} className="space-y-4 pt-2 border-t">
              <Alert className="border-blue-200 bg-blue-50">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>How this works</AlertTitle>
                <AlertDescription className="text-sm">
                  1. Open your email app and send the document to <strong>{row.expected_email ?? 'the lender'}</strong>.<br />
                  2. Come back here and fill in the form below — this creates a tamper-evident record on the platform that you sent it.<br />
                  <strong>The platform never receives or stores the file.</strong>
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="from-email">Your email (sent FROM)</Label>
                <Input id="from-email" type="email" value={myEmail} onChange={e => setMyEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-email">Lender email (sent TO)</Label>
                <Input id="to-email" type="email" value={sentTo} onChange={e => setSentTo(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Attached 3 PDFs covering Jan–Mar." />
              </div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Mark as sent
              </Button>
            </form>
          ) : (
            <div className="space-y-2 pt-2 border-t">
              <p className="font-medium text-sm">Your attestation</p>
              <dl className="text-sm space-y-1 rounded-lg border bg-muted/30 p-4">
                <dt className="text-muted-foreground">Sent from</dt><dd>{row.borrower_sent_from_email}</dd>
                <dt className="text-muted-foreground">Sent to</dt><dd>{row.borrower_sent_to_email}</dd>
                <dt className="text-muted-foreground">At</dt><dd>{row.borrower_sent_at ? new Date(row.borrower_sent_at).toLocaleString() : '—'}</dd>
                {row.borrower_send_notes && (<><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{row.borrower_send_notes}</dd></>)}
              </dl>
              {row.status === 'rejected' && row.lender_decision_notes && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Lender rejected this</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">{row.lender_decision_notes}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
