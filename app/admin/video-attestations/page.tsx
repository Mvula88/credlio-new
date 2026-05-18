'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, Video, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

type Row = {
  id: string
  borrower_id: string
  loan_request_id: string | null
  video_hash: string
  video_duration_seconds: number | null
  recorded_at: string
  attestation_transcript: string | null
  attestation_language: string | null
  spoken_name: string | null
  spoken_date: string | null
  spoken_amount: number | null
  spoken_currency: string | null
  name_matches_profile: boolean | null
  date_matches_today: boolean | null
  amount_matches_request: boolean | null
  passed_verification: boolean | null
  risk_flags: string[] | null
  borrower_ip_hash: string | null
  borrower_user_agent: string | null
  sent_to_lender_email: string | null
  borrowers: { full_name: string | null; country_code: string | null } | null
}

export default function AdminVideoAttestationsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'failed' | 'passed'>('all')
  const [selected, setSelected] = useState<Row | null>(null)

  useEffect(() => {
    void (async () => {
      let q = supabase
        .from('video_verifications')
        .select('*, borrowers!borrower_id(full_name, country_code)')
        .eq('verification_type', 'spoken_attestation')
        .order('recorded_at', { ascending: false })
        .limit(500)
      if (filter === 'failed') q = q.eq('passed_verification', false)
      if (filter === 'passed') q = q.eq('passed_verification', true)
      const { data } = await q
      setRows((data as any) ?? [])
      setLoading(false)
    })()
  }, [supabase, filter])

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" />
          Video Attestations
        </h1>
        <p className="text-muted-foreground text-sm">
          Borrower-recorded video attestations (spoken name + today's date + loan amount). The platform stores the transcript + a fingerprint; the video itself stays with the lender. Match flags are auto-computed against the borrower profile and loan request.
        </p>
      </div>

      <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All attestations</SelectItem>
          <SelectItem value="failed">Failed verification only</SelectItem>
          <SelectItem value="passed">Passed verification only</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No video attestations recorded yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left p-4 hover:bg-accent/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {r.passed_verification ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.borrowers?.full_name ?? r.borrower_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.recorded_at).toLocaleString()} · {r.video_duration_seconds ?? '?'}s
                        {r.spoken_amount && ` · ${r.spoken_currency ?? ''} ${r.spoken_amount}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Flag ok={r.name_matches_profile} label="name" />
                    <Flag ok={r.date_matches_today} label="date" />
                    <Flag ok={r.amount_matches_request} label="amount" />
                  </div>
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
                  Attestation by {selected.borrowers?.full_name ?? 'borrower'}
                  {selected.passed_verification ? (
                    <Badge>Passed</Badge>
                  ) : (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Transcript</p>
                  <p className="whitespace-pre-wrap italic">"{selected.attestation_transcript ?? '—'}"</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldCheck label="Spoken name" value={selected.spoken_name} ok={selected.name_matches_profile} />
                  <FieldCheck label="Spoken date" value={selected.spoken_date} ok={selected.date_matches_today} />
                  <FieldCheck label="Spoken amount" value={selected.spoken_amount?.toString()} ok={selected.amount_matches_request} />
                  <FieldCheck label="Duration" value={selected.video_duration_seconds ? `${selected.video_duration_seconds}s` : '—'} ok={selected.video_duration_seconds ? selected.video_duration_seconds >= 10 : null} />
                </div>

                {selected.risk_flags && selected.risk_flags.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                    <p className="text-xs uppercase tracking-wider text-red-700 font-medium">Risk flags</p>
                    <ul className="text-sm space-y-0.5">
                      {selected.risk_flags.map((f, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 text-red-600 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
                  <p className="text-muted-foreground">Video hash <span className="font-mono">{selected.video_hash.slice(0, 24)}…</span></p>
                  {selected.borrower_ip_hash && <p className="text-muted-foreground">IP hash <span className="font-mono">{selected.borrower_ip_hash.slice(0, 16)}…</span></p>}
                  {selected.borrower_user_agent && <p className="text-muted-foreground truncate">UA <span className="font-mono">{selected.borrower_user_agent}</span></p>}
                </div>

                <div>
                  <Link href={`/admin/borrowers/${selected.borrower_id}`} className="text-primary hover:underline text-sm">Open borrower profile →</Link>
                </div>
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

function Flag({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <Badge variant="outline" className="text-xs">{label}: —</Badge>
  return ok ? (
    <Badge className="bg-green-600 text-xs">{label}</Badge>
  ) : (
    <Badge variant="destructive" className="text-xs">{label}</Badge>
  )
}

function FieldCheck({ label, value, ok }: { label: string; value: string | null | undefined; ok: boolean | null }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="font-medium truncate">{value ?? '—'}</p>
        {ok !== null && (ok ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />)}
      </div>
    </div>
  )
}
