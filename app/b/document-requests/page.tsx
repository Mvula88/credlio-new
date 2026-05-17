'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileClock, FileCheck, FileX, FileQuestion } from 'lucide-react'

type Row = {
  id: string
  document_type: string
  status: string
  created_at: string
  due_at: string | null
  request_notes: string | null
  expected_email: string | null
  lender_id: string
}

const STATUS: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof FileCheck }> = {
  requested: { label: 'Action needed — send it', tone: 'default', Icon: FileQuestion },
  pending_borrower: { label: 'Action needed — send it', tone: 'default', Icon: FileQuestion },
  sent_by_borrower: { label: 'Awaiting lender', tone: 'secondary', Icon: FileClock },
  received: { label: 'Received by lender', tone: 'default', Icon: FileCheck },
  rejected: { label: 'Rejected — re-send', tone: 'destructive', Icon: FileX },
  cancelled: { label: 'Cancelled', tone: 'outline', Icon: FileX },
}

function humanDocType(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Id', 'ID')
}

export default function BorrowerDocumentRequestsIndex() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('document_requests')
        .select('id, document_type, status, created_at, due_at, request_notes, expected_email, lender_id')
        .order('created_at', { ascending: false })
      setRows((data as any) ?? [])
      setLoading(false)
    })()
  }, [supabase])

  const action = rows.filter(r => ['requested', 'pending_borrower', 'rejected'].includes(r.status))
  const sent = rows.filter(r => r.status === 'sent_by_borrower')
  const closed = rows.filter(r => ['received', 'cancelled'].includes(r.status))

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Document Requests</h1>
        <p className="text-muted-foreground text-sm">
          Documents lenders have asked you to send by email. Send the file directly to their address, then mark it as sent here.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <Section title="Action needed" rows={action} highlight />
          <Section title="Awaiting lender confirmation" rows={sent} />
          <Section title="Closed" rows={closed} />
        </div>
      )}
    </div>
  )
}

function Section({ title, rows, highlight = false }: { title: string; rows: Row[]; highlight?: boolean }) {
  return (
    <Card className={highlight && rows.length > 0 ? 'border-primary/40' : ''}>
      <CardHeader>
        <CardTitle className="text-base">{title} <span className="text-muted-foreground font-normal">({rows.length})</span></CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <div className="divide-y">
            {rows.map(r => {
              const meta = STATUS[r.status] ?? STATUS.pending_borrower
              const Icon = meta.Icon
              return (
                <Link key={r.id} href={`/b/document-requests/${r.id}`} className="flex items-center justify-between py-3 hover:bg-accent/50 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{humanDocType(r.document_type)}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested {new Date(r.created_at).toLocaleDateString()}
                        {r.due_at && ` · due ${new Date(r.due_at).toLocaleDateString()}`}
                        {r.expected_email && ` · send to ${r.expected_email}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={meta.tone}>{meta.label}</Badge>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
