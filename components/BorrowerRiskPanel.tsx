'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ShieldAlert, ShieldCheck, AlertTriangle, ExternalLink, Loader2, Camera, FileText, Fingerprint } from 'lucide-react'

interface Props {
  borrowerId: string
}

type SelfieRow = {
  id: string
  document_type: string
  risk_score: number | null
  risk_factors: string[] | null
  perceptual_hash: string | null
  cross_borrower_match_borrower_id: string | null
  status: string
  uploaded_at: string
}

type DocVerifRow = {
  id: string
  document_type: string
  document_name: string
  risk_score: number | null
  risk_factors: string[] | null
  risk_level: string | null
  cross_borrower_match_borrower_id: string | null
  status: string
  created_at: string
}

type VerifStatus = {
  verification_status: string | null
  overall_risk_score: number | null
  overall_risk_level: string | null
  smile_id_outcome: string | null
  rejection_reason: string | null
}

function riskBadgeVariant(level: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'high') return 'destructive'
  if (level === 'medium') return 'secondary'
  if (level === 'low') return 'default'
  return 'outline'
}

function statusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'approved') return 'default'
  if (status === 'rejected' || status === 'banned') return 'destructive'
  if (status === 'pending') return 'secondary'
  return 'outline'
}

export function BorrowerRiskPanel({ borrowerId }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [selfies, setSelfies] = useState<SelfieRow[]>([])
  const [docs, setDocs] = useState<DocVerifRow[]>([])
  const [verif, setVerif] = useState<VerifStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [selfieRes, docRes, statusRes] = await Promise.all([
          supabase
            .from('borrower_documents')
            .select('id, document_type, risk_score, risk_factors, perceptual_hash, cross_borrower_match_borrower_id, status, uploaded_at')
            .eq('borrower_id', borrowerId)
            .order('uploaded_at', { ascending: false }),
          supabase
            .from('document_verifications')
            .select('id, document_type, document_name, risk_score, risk_factors, risk_level, cross_borrower_match_borrower_id, status, created_at')
            .eq('borrower_id', borrowerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('borrower_self_verification_status')
            .select('verification_status, overall_risk_score, overall_risk_level, smile_id_outcome, rejection_reason')
            .eq('borrower_id', borrowerId)
            .maybeSingle(),
        ])
        setSelfies(selfieRes.data ?? [])
        setDocs(docRes.data ?? [])
        setVerif(statusRes.data ?? null)
      } catch (e: any) {
        setError(e.message ?? 'Failed to load risk data')
      } finally {
        setLoading(false)
      }
    })()
  }, [borrowerId, supabase])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const crossBorrowerHits = [
    ...selfies.filter(s => s.cross_borrower_match_borrower_id),
    ...docs.filter(d => d.cross_borrower_match_borrower_id),
  ]
  const hasHighRiskSelfie = selfies.some(s => (s.risk_score ?? 0) >= 61)
  const hasHighRiskDoc = docs.some(d => (d.risk_score ?? 0) >= 61 || d.risk_level === 'high')
  const overallToneIsHigh = (verif?.overall_risk_level === 'high') || hasHighRiskSelfie || hasHighRiskDoc || crossBorrowerHits.length > 0

  return (
    <Card className={overallToneIsHigh ? 'border-red-300 bg-red-50/30' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {overallToneIsHigh ? (
              <ShieldAlert className="h-5 w-5 text-red-600" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary" />
            )}
            Borrower risk summary
          </span>
          {verif?.overall_risk_level && (
            <Badge variant={riskBadgeVariant(verif.overall_risk_level)}>
              {verif.overall_risk_level.toUpperCase()} RISK
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          What the platform's fraud checks have detected for this borrower. Review this before ticking "Identity & risk flags reviewed" below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cross-borrower duplicate alerts — the loudest signal */}
        {crossBorrowerHits.length > 0 && (
          <Alert variant="destructive">
            <Fingerprint className="h-4 w-4" />
            <AlertTitle>Cross-borrower duplicate detected</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                {crossBorrowerHits.length} document fingerprint(s) match another borrower's. This is the "rented document" / "same person two accounts" signal.
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {crossBorrowerHits.map(h => (
                  <li key={h.id}>
                    {('document_name' in h ? h.document_name : h.document_type)} — also seen under{' '}
                    <Link href={`/l/borrowers/${h.cross_borrower_match_borrower_id}`} className="underline hover:no-underline">
                      another borrower <ExternalLink className="h-3 w-3 inline" />
                    </Link>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Overall verification status */}
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Platform verification status</p>
            <Badge variant={statusVariant(verif?.verification_status)}>
              {verif?.verification_status ?? 'unknown'}
            </Badge>
          </div>
          {verif?.rejection_reason && (
            <p className="text-sm text-muted-foreground">{verif.rejection_reason}</p>
          )}
          {verif?.smile_id_outcome && verif.smile_id_outcome !== 'pending' && (
            <p className="text-sm">
              Smile ID: <Badge variant={verif.smile_id_outcome === 'approved' ? 'default' : 'destructive'}>{verif.smile_id_outcome}</Badge>
            </p>
          )}
        </div>

        {/* Selfie metadata */}
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <Camera className="h-4 w-4 text-muted-foreground" />
              Selfie & ID photo
            </p>
            {selfies.length === 0 ? (
              <Badge variant="outline">Not uploaded</Badge>
            ) : (
              <Badge variant={selfies[0].risk_score && selfies[0].risk_score >= 61 ? 'destructive' : 'secondary'}>
                Risk {selfies[0].risk_score ?? 0}/100
              </Badge>
            )}
          </div>
          {selfies.length > 0 && selfies[0].risk_factors && selfies[0].risk_factors.length > 0 && (
            <ul className="text-sm space-y-1">
              {selfies[0].risk_factors.map((f, i) => (
                <li key={i} className="flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          {selfies.length > 0 && (!selfies[0].risk_factors || selfies[0].risk_factors.length === 0) && (
            <p className="text-sm text-muted-foreground">No risk factors detected.</p>
          )}
        </div>

        {/* Lender-checked documents (this lender's own + any others if RLS allows) */}
        {docs.length > 0 && (
          <div className="rounded-lg border bg-white p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Documents verified by lenders ({docs.length})
            </p>
            <div className="divide-y">
              {docs.map(d => (
                <div key={d.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.document_name || d.document_type}</p>
                    {d.risk_factors && d.risk_factors.length > 0 && (
                      <p className="text-xs text-muted-foreground">{d.risk_factors.join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={riskBadgeVariant(d.risk_level)}>{d.risk_level ?? `${d.risk_score ?? 0}/100`}</Badge>
                    <Badge variant={d.status === 'verified' ? 'default' : d.status === 'flagged' ? 'destructive' : 'outline'}>
                      {d.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selfies.length === 0 && docs.length === 0 && crossBorrowerHits.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No risk signals on file for this borrower yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
