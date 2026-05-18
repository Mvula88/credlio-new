'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, FileCheck, Mail, User, Building, Clock, Search } from 'lucide-react'

type Row = {
  id: string
  document_type: string
  status: string
  request_notes: string | null
  expected_email: string | null
  borrower_sent_at: string | null
  borrower_sent_from_email: string | null
  borrower_sent_to_email: string | null
  borrower_send_notes: string | null
  lender_received_at: string | null
  lender_received_via_email: string | null
  lender_decision_notes: string | null
  created_at: string
  updated_at: string
  due_at: string | null
  loan_request_id: string | null
  loan_id: string | null
  borrower_id: string
  lender_id: string
  borrowers: { full_name: string | null } | null
  lender: { full_name: string | null } | null
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  requested: 'secondary',
  pending_borrower: 'secondary',
  sent_by_borrower: 'default',
  received: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
}

export default function AdminDocumentRequestsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)

  useEffect(() => {
    void (async () => {
      let q = supabase
        .from('document_requests')
        .select('*, borrowers(full_name)')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      const { data } = await q

      // Enrich lender names from profiles.
      const lenderIds = [...new Set((data ?? []).map((r: any) => r.lender_id))]
      const { data: profiles } = lenderIds.length
        ? await supabase.from('profiles').select('user_id, full_name').in('user_id', lenderIds)
        : { data: [] as any[] }
      const profById = new Map((profiles ?? []).map((p: any) => [p.user_id, p]))

      setRows((data ?? []).map((r: any) => ({ ...r, lender: profById.get(r.lender_id) ?? null })))
      setLoading(false)
    })()
  }, [supabase, statusFilter])

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.borrowers?.full_name ?? '').toLowerCase().includes(q)
      || (r.lender?.full_name ?? '').toLowerCase().includes(q)
      || r.document_type.toLowerCase().includes(q)
    )
  })

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-primary" />
          Document Requests
        </h1>
        <p className="text-muted-foreground text-sm">
          The lender→borrower document acknowledgment loop. Each row is the platform's record of an off-platform document exchange. Files are not stored — only the metadata about who said what when. This is the evidence trail for any document-related dispute.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search borrower / lender / type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border rounded w-full text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending_borrower">Awaiting borrower</SelectItem>
            <SelectItem value="sent_by_borrower">Sent — pending lender</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No document requests.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left p-4 hover:bg-accent/50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {r.document_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      <Building className="h-3 w-3 inline mr-1" />{r.lender?.full_name ?? 'Lender'}
                      {' → '}
                      <User className="h-3 w-3 inline mr-1" />{r.borrowers?.full_name ?? 'Borrower'}
                      {' · '}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[r.status] ?? 'outline'}>{r.status.replace(/_/g, ' ')}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.document_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  <Badge variant={STATUS_VARIANTS[selected.status] ?? 'outline'}>{selected.status.replace(/_/g, ' ')}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <Section title="Request">
                  <Dl k="Lender" v={selected.lender?.full_name ?? selected.lender_id} />
                  <Dl k="Borrower" v={
                    <Link href={`/admin/borrowers/${selected.borrower_id}`} className="underline">{selected.borrowers?.full_name ?? selected.borrower_id}</Link>
                  } />
                  <Dl k="Requested" v={new Date(selected.created_at).toLocaleString()} />
                  {selected.due_at && <Dl k="Due" v={new Date(selected.due_at).toLocaleDateString()} />}
                  {selected.expected_email && <Dl k="Expected email" v={selected.expected_email} />}
                  {selected.request_notes && <Dl k="Instructions" v={<span className="whitespace-pre-wrap">{selected.request_notes}</span>} />}
                </Section>

                {selected.borrower_sent_at && (
                  <Section title="Borrower attestation">
                    <Dl k="At" v={new Date(selected.borrower_sent_at).toLocaleString()} />
                    <Dl k="From" v={selected.borrower_sent_from_email ?? '—'} />
                    <Dl k="To" v={selected.borrower_sent_to_email ?? '—'} />
                    {selected.borrower_send_notes && <Dl k="Notes" v={<span className="whitespace-pre-wrap">{selected.borrower_send_notes}</span>} />}
                  </Section>
                )}

                {selected.lender_received_at && (
                  <Section title="Lender decision">
                    <Dl k="At" v={new Date(selected.lender_received_at).toLocaleString()} />
                    {selected.lender_received_via_email && <Dl k="Received on" v={selected.lender_received_via_email} />}
                    {selected.lender_decision_notes && <Dl k="Notes" v={<span className="whitespace-pre-wrap">{selected.lender_decision_notes}</span>} />}
                  </Section>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <dl className="space-y-1">{children}</dl>
    </div>
  )
}

function Dl({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="col-span-2">{v}</dd>
    </div>
  )
}
