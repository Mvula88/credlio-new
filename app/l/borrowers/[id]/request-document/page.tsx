'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react'

const DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'proof_of_address', label: 'Proof of address' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'payslip', label: 'Payslip' },
  { value: 'employment_letter', label: 'Employment letter' },
  { value: 'business_registration', label: 'Business registration' },
  { value: 'tax_clearance', label: 'Tax clearance' },
  { value: 'reference_letter', label: 'Reference letter' },
]

export default function RequestDocumentPage() {
  const params = useParams()
  const router = useRouter()
  const borrowerId = params?.id as string
  const supabase = createClient()

  const [borrowerName, setBorrowerName] = useState<string>('')
  const [lenderEmail, setLenderEmail] = useState<string>('')
  const [docType, setDocType] = useState<string>('bank_statement')
  const [notes, setNotes] = useState('')
  const [expectedEmail, setExpectedEmail] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', user.id)
        .single()
      if (profile?.email) {
        setLenderEmail(profile.email)
        setExpectedEmail(profile.email)
      } else if (user.email) {
        setLenderEmail(user.email)
        setExpectedEmail(user.email)
      }

      const { data: borrower } = await supabase
        .from('borrowers')
        .select('full_name')
        .eq('id', borrowerId)
        .single()
      setBorrowerName(borrower?.full_name ?? '')
    })()
  }, [borrowerId, supabase, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/lender/document-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          borrower_id: borrowerId,
          document_type: docType,
          request_notes: notes || null,
          expected_email: expectedEmail || null,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create request')
      router.push(`/l/document-requests/${json.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Link href={`/l/borrowers/${borrowerId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to borrower
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Request a document from {borrowerName || 'borrower'}
          </CardTitle>
          <CardDescription>
            The borrower will email the file directly to you. The platform records that you requested it
            and that they sent it — but never stores the document itself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="doc-type">Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="doc-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Instructions to the borrower</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Last 3 months of statements from FNB, PDF preferred."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected-email">Email the borrower should send to</Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="expected-email"
                  type="email"
                  className="pl-9"
                  value={expectedEmail}
                  onChange={e => setExpectedEmail(e.target.value)}
                  placeholder={lenderEmail || 'you@example.com'}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The borrower sees this and is expected to email the document here from their own address.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-at">Due date (optional)</Label>
              <Input
                id="due-at"
                type="date"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
