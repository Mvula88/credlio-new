'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Globe, ArrowRightLeft, AlertTriangle, CheckCircle2, XCircle, Trash2 } from 'lucide-react'

type Alert = {
  id: string
  alert_type: string
  borrower_a_id: string
  borrower_a_country_code: string
  borrower_b_id: string
  borrower_b_country_code: string
  fingerprint: string | null
  status: string
  admin_notes: string | null
  detected_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  borrower_a: { full_name: string | null } | null
  borrower_b: { full_name: string | null } | null
}

const TYPE_LABEL: Record<string, string> = {
  selfie_phash: 'Same selfie fingerprint',
  document_phash: 'Same document fingerprint',
  national_id_hash: 'Same national ID number',
  phone_e164: 'Same phone number',
  name_dob: 'Same name & date of birth',
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Open', variant: 'destructive' },
  reviewed_legit: { label: 'Legitimate', variant: 'default' },
  reviewed_fraud: { label: 'Fraud', variant: 'destructive' },
  dismissed: { label: 'Dismissed', variant: 'outline' },
}

export default function AdminCrossCountryAlertsPage() {
  const supabase = createClient()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [selected, setSelected] = useState<Alert | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('cross_country_dedup_alerts')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(500)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data } = await q

    const borrowerIds = new Set<string>()
    ;(data ?? []).forEach((a: any) => {
      borrowerIds.add(a.borrower_a_id)
      borrowerIds.add(a.borrower_b_id)
    })
    const { data: borrowers } = borrowerIds.size
      ? await supabase.from('borrowers').select('id, full_name').in('id', Array.from(borrowerIds))
      : { data: [] as any[] }
    const byId = new Map((borrowers ?? []).map((b: any) => [b.id, b]))

    setAlerts((data ?? []).map((a: any) => ({
      ...a,
      borrower_a: byId.get(a.borrower_a_id) ?? null,
      borrower_b: byId.get(a.borrower_b_id) ?? null,
    })))
    setLoading(false)
  }

  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter])

  const resolve = async (newStatus: 'reviewed_legit' | 'reviewed_fraud' | 'dismissed') => {
    if (!selected) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('cross_country_dedup_alerts')
      .update({
        status: newStatus,
        admin_notes: notes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
      })
      .eq('id', selected.id)
    setSaving(false)
    setSelected(null)
    setNotes('')
    await load()
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-red-600" />
          Cross-Country Dedup Alerts
        </h1>
        <p className="text-muted-foreground text-sm">
          The same fingerprint (selfie image, ID number, phone, or name+DOB) is registered under borrower accounts in two different countries. Lenders never see these — country isolation is preserved. You decide if it's two different real people with coincidentally similar data, or one fraudster operating across borders.
        </p>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="reviewed_legit">Marked legitimate</SelectItem>
          <SelectItem value="reviewed_fraud">Marked fraud</SelectItem>
          <SelectItem value="dismissed">Dismissed</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No cross-country alerts in this filter.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => {
            const meta = STATUS_LABEL[a.status] ?? STATUS_LABEL.open
            return (
              <Card
                key={a.id}
                className={a.status === 'open' ? 'border-red-300 bg-red-50/40 cursor-pointer hover:bg-red-50/70' : 'cursor-pointer hover:bg-accent/30'}
                onClick={() => { setSelected(a); setNotes(a.admin_notes ?? '') }}
              >
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{TYPE_LABEL[a.alert_type] ?? a.alert_type}</p>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Link
                      href={`/admin/borrowers/${a.borrower_a_id}`}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 hover:underline"
                    >
                      <p className="font-medium truncate">{a.borrower_a?.full_name ?? 'Borrower'}</p>
                      <p className="text-xs text-muted-foreground">{a.borrower_a_country_code} · {a.borrower_a_id.slice(0, 8)}</p>
                    </Link>
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Link
                      href={`/admin/borrowers/${a.borrower_b_id}`}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 text-right hover:underline"
                    >
                      <p className="font-medium truncate">{a.borrower_b?.full_name ?? 'Borrower'}</p>
                      <p className="text-xs text-muted-foreground">{a.borrower_b_country_code} · {a.borrower_b_id.slice(0, 8)}</p>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Detected {new Date(a.detected_at).toLocaleString()}
                    {a.fingerprint && (<> · <span className="font-mono">{a.fingerprint.slice(0, 24)}{a.fingerprint.length > 24 ? '…' : ''}</span></>)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{TYPE_LABEL[selected.alert_type] ?? selected.alert_type}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Matched borrowers</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Link href={`/admin/borrowers/${selected.borrower_a_id}`} className="hover:underline">
                        <p className="font-medium truncate">{selected.borrower_a?.full_name ?? 'Borrower A'}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground">{selected.borrower_a_country_code}</p>
                    </div>
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <div className="flex-1 min-w-0 text-right">
                      <Link href={`/admin/borrowers/${selected.borrower_b_id}`} className="hover:underline">
                        <p className="font-medium truncate">{selected.borrower_b?.full_name ?? 'Borrower B'}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground">{selected.borrower_b_country_code}</p>
                    </div>
                  </div>
                </div>

                {selected.fingerprint && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <p className="uppercase tracking-wider text-muted-foreground mb-1">Fingerprint</p>
                    <p className="font-mono break-all">{selected.fingerprint}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Admin notes</label>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="What did you check? Who did you call? What was the outcome?"
                    className="mt-1"
                  />
                </div>

                {selected.reviewed_at && (
                  <p className="text-xs text-muted-foreground">
                    Last reviewed {new Date(selected.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                <Button variant="outline" onClick={() => resolve('dismissed')} disabled={saving}>
                  <Trash2 className="h-4 w-4 mr-2" /> Dismiss
                </Button>
                <Button variant="outline" className="border-green-500 text-green-700" onClick={() => resolve('reviewed_legit')} disabled={saving}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark legitimate
                </Button>
                <Button variant="destructive" onClick={() => resolve('reviewed_fraud')} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                  Mark fraud
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
