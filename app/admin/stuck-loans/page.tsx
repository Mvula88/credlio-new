'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, FileCheck, Video, ShieldAlert, Clock } from 'lucide-react'

type Row = {
  id: string
  borrower_id: string
  lender_id: string
  status: string
  principal_minor: number
  currency: string
  country_code: string
  created_at: string
  updated_at: string
  lender_docs_verified_at: string | null
  lender_video_verified_at: string | null
  lender_metadata_verified_at: string | null
  borrower_accepted_at: string | null
  borrowers: { full_name: string | null } | null
  lender: { full_name: string | null } | null
}

export default function AdminStuckLoansPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      // "Stuck" = pending_signatures or pending_disbursement, AND at least
      // one of the three verification timestamps is null. These loans cannot
      // progress to active until the lender finishes verifying.
      const { data } = await supabase
        .from('loans')
        .select('id, borrower_id, lender_id, status, principal_minor, currency, country_code, created_at, updated_at, lender_docs_verified_at, lender_video_verified_at, lender_metadata_verified_at, borrower_accepted_at, borrowers!borrower_id(full_name)')
        .in('status', ['pending_signatures', 'pending_disbursement'])
        .order('updated_at', { ascending: true })
        .limit(500)

      const stuck = (data ?? []).filter((r: any) =>
        !r.lender_docs_verified_at || !r.lender_video_verified_at || !r.lender_metadata_verified_at
      )

      const lenderIds = [...new Set(stuck.map((r: any) => r.lender_id))]
      const { data: profiles } = lenderIds.length
        ? await supabase.from('profiles').select('user_id, full_name').in('user_id', lenderIds)
        : { data: [] as any[] }
      const profById = new Map((profiles ?? []).map((p: any) => [p.user_id, p]))

      setRows(stuck.map((r: any) => ({ ...r, lender: profById.get(r.lender_id) ?? null })))
      setLoading(false)
    })()
  }, [supabase])

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-orange-600" />
          Stuck Loans
        </h1>
        <p className="text-muted-foreground text-sm">
          Loans that have been accepted by the borrower but cannot become active because the lender hasn't completed all three pre-disbursement verification steps (documents · video · identity flags). The loan is frozen until the lender finishes.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No stuck loans. Every in-flight loan has its verification steps complete.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const daysStuck = r.borrower_accepted_at
              ? Math.floor((Date.now() - new Date(r.borrower_accepted_at).getTime()) / 86_400_000)
              : 0
            const stale = daysStuck >= 3
            return (
              <Card key={r.id} className={stale ? 'border-red-300 bg-red-50/40' : 'border-orange-300 bg-orange-50/30'}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {r.currency} {(r.principal_minor / 100).toLocaleString()}
                        {' — '}
                        <Link href={`/admin/borrowers/${r.borrower_id}`} className="hover:underline">{r.borrowers?.full_name ?? 'Borrower'}</Link>
                      </CardTitle>
                      <CardDescription>
                        Lender: {r.lender?.full_name ?? r.lender_id.slice(0, 8)} · accepted {r.borrower_accepted_at ? new Date(r.borrower_accepted_at).toLocaleString() : '—'}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={stale ? 'destructive' : 'secondary'}>
                        <Clock className="h-3 w-3 mr-1" />
                        {daysStuck}d stuck
                      </Badge>
                      <Badge variant="outline">{r.status.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <StepPill icon={FileCheck} label="Documents" at={r.lender_docs_verified_at} />
                    <StepPill icon={Video} label="Video" at={r.lender_video_verified_at} />
                    <StepPill icon={ShieldAlert} label="Risk flags" at={r.lender_metadata_verified_at} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StepPill({ icon: Icon, label, at }: { icon: any; label: string; at: string | null }) {
  const done = !!at
  return (
    <div className={`flex items-center gap-2 rounded-md border p-2 ${done ? 'bg-green-50 border-green-300' : 'bg-white border-orange-300'}`}>
      <Icon className={`h-4 w-4 ${done ? 'text-green-600' : 'text-orange-500'}`} />
      <div className="min-w-0">
        <p className={`text-xs font-medium ${done ? 'text-green-900' : 'text-orange-900'}`}>{label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{done ? new Date(at!).toLocaleDateString() : 'Not done'}</p>
      </div>
    </div>
  )
}
