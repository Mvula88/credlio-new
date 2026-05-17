'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, Loader2, Calendar, Banknote } from 'lucide-react'

interface Props {
  borrowerId: string
}

interface Summary {
  earliest_unpaid_due_date: string | null
  days_since_earliest_unpaid: number | null
  unpaid_installment_count: number | null
  total_unpaid_minor: number | null
  currency: string | null
  affected_loan_count: number | null
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', ZAR: 'R', NAD: 'N$', KES: 'KSh', NGN: '₦', GHS: 'GH₵',
  UGX: 'USh', TZS: 'TSh', RWF: 'FRw',
}

function formatMinor(minor: number, currency: string | null): string {
  const symbol = currency ? (CURRENCY_SYMBOL[currency] ?? currency + ' ') : ''
  return `${symbol}${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export function BorrowerUnpaidSummary({ borrowerId }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('get_borrower_unpaid_summary', { p_borrower_id: borrowerId })
      // RPC returns SETOF; supabase-js gives an array. We want the single row or null.
      const row = Array.isArray(data) ? data[0] : data
      setSummary(row ?? null)
      setLoading(false)
    })()
  }, [borrowerId, supabase])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Checking unpaid history…</span>
        </CardContent>
      </Card>
    )
  }

  // No unpaid installments → everything is current.
  if (!summary || summary.earliest_unpaid_due_date === null) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="flex items-center gap-3 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">All loan payments up to date</p>
            <p className="text-xs text-muted-foreground">No overdue installments across any lender on the platform.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const days = summary.days_since_earliest_unpaid ?? 0
  const tone = days >= 30 ? 'destructive' : days >= 14 ? 'destructive' : days >= 1 ? 'secondary' : 'outline'
  const borderClass = days >= 14 ? 'border-red-300 bg-red-50/40' : days >= 1 ? 'border-orange-300 bg-orange-50/40' : ''

  return (
    <Card className={borderClass}>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${days >= 14 ? 'text-red-600' : 'text-orange-600'}`} />
            <div>
              <p className="font-semibold text-sm">
                Unpaid for {days} day{days === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-muted-foreground">
                Across all lenders on Credlio. Earliest unpaid installment was due {new Date(summary.earliest_unpaid_due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.
              </p>
            </div>
          </div>
          <Badge variant={tone}>{days}d late</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t">
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Banknote className="h-3 w-3" /> Outstanding
            </div>
            <p className="font-medium">{formatMinor(summary.total_unpaid_minor ?? 0, summary.currency)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> Installments
            </div>
            <p className="font-medium">{summary.unpaid_installment_count ?? 0}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> Loans affected
            </div>
            <p className="font-medium">{summary.affected_loan_count ?? 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
