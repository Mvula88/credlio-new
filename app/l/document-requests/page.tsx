'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, FileCheck, FileClock, FileX, FileQuestion } from 'lucide-react'

type Row = {
  id: string
  document_type: string
  status: string
  created_at: string
  borrower_sent_at: string | null
  lender_received_at: string | null
  due_at: string | null
  borrower_id: string
  borrowers: { full_name: string | null } | null
}

const STATUS_META: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline'; Icon: typeof FileCheck }> = {
  requested: { label: 'Requested', tone: 'secondary', Icon: FileQuestion },
  pending_borrower: { label: 'Awaiting borrower', tone: 'secondary', Icon: FileClock },
  sent_by_borrower: { label: 'Sent — confirm receipt', tone: 'default', Icon: FileClock },
  received: { label: 'Received', tone: 'default', Icon: FileCheck },
  rejected: { label: 'Rejected', tone: 'destructive', Icon: FileX },
  cancelled: { label: 'Cancelled', tone: 'outline', Icon: FileX },
}

function humanDocType(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Id', 'ID')
}

export default function LenderDocumentRequestsIndex() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('document_requests')
        .select('id, document_type, status, created_at, borrower_sent_at, lender_received_at, due_at, borrower_id, borrowers!inner(full_name)')
        .order('created_at', { ascending: false })
      setRows((data as any) ?? [])
      setLoading(false)
    })()
  }, [supabase])

  const groups = {
    actionable: rows.filter(r => r.status === 'sent_by_borrower'),
    awaiting: rows.filter(r => r.status === 'pending_borrower' || r.status === 'requested'),
    closed: rows.filter(r => ['received', 'rejected', 'cancelled'].includes(r.status)),
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Verification</h1>
          <p className="text-muted-foreground text-sm">Request documents from borrowers and verify them once received. The platform records the exchange — files stay between you and the borrower.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <Section title="Awaiting your confirmation" rows={groups.actionable} highlight />
          <Section title="Awaiting borrower" rows={groups.awaiting} />
          <Section title="Closed" rows={groups.closed} />
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
              const meta = STATUS_META[r.status] ?? STATUS_META.requested
              const Icon = meta.Icon
              return (
                <Link key={r.id} href={`/l/document-requests/${r.id}`} className="flex items-center justify-between py-3 hover:bg-accent/50 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{humanDocType(r.document_type)} — {r.borrowers?.full_name ?? 'Borrower'}</p>
                      <p className="text-xs text-muted-foreground">Created {new Date(r.created_at).toLocaleDateString()} {r.due_at && `· due ${new Date(r.due_at).toLocaleDateString()}`}</p>
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
