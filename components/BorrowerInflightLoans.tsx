'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, Clock } from 'lucide-react'

interface Props {
  borrowerId: string
  /** Optional: hide loans belonging to this lender (e.g. when the panel
   * is rendered on a lender's own loan detail page — they already know
   * about their own loan). */
  excludeLenderId?: string
}

interface Row {
  loan_id: string
  lender_id: string
  lender_name: string
  status: string
  principal_minor: number
  currency: string
  country_code: string
  borrower_accepted_at: string | null
  hours_since_accept: number | null
  created_at: string
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', ZAR: 'R', NAD: 'N$', KES: 'KSh', NGN: '₦', GHS: 'GH₵',
  UGX: 'USh', TZS: 'TSh', RWF: 'FRw',
}

function formatMinor(minor: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency + ' '
  return `${symbol}${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function statusLabel(s: string): string {
  if (s === 'pending_signatures') return 'Awaiting signatures'
  if (s === 'pending_disbursement') return 'Awaiting disbursement'
  return s
}

export function BorrowerInflightLoans({ borrowerId, excludeLenderId }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('get_borrower_inflight_loans', { p_borrower_id: borrowerId })
      const list: Row[] = Array.isArray(data) ? data : []
      setRows(excludeLenderId ? list.filter(r => r.lender_id !== excludeLenderId) : list)
      setLoading(false)
    })()
  }, [borrowerId, excludeLenderId, supabase])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Checking in-flight loans…</span>
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) return null

  return (
    <Card className="border-red-300 bg-red-50/40">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {rows.length} loan{rows.length === 1 ? '' : 's'} in progress with other lender{rows.length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground">
              This borrower has accepted a loan with another lender on Credlio that has not yet been disbursed.
              They could end up owing both of you. Confirm with them before disbursing.
            </p>
          </div>
        </div>
        <div className="divide-y border-t pt-2">
          {rows.map(r => (
            <div key={r.loan_id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.lender_name} — {formatMinor(r.principal_minor, r.currency)}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Accepted {r.borrower_accepted_at ? new Date(r.borrower_accepted_at).toLocaleString() : '—'}
                </p>
              </div>
              <Badge variant="destructive" className="flex-shrink-0">{statusLabel(r.status)}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
