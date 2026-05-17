'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ShieldCheck, FileCheck, Video, AlertTriangle, CheckCircle2, Loader2, ExternalLink, Undo2 } from 'lucide-react'

type Step = 'docs' | 'video' | 'metadata'

interface Props {
  loanId: string
  loanStatus: string
  borrowerId: string
  docsVerifiedAt: string | null
  videoVerifiedAt: string | null
  metadataVerifiedAt: string | null
  docsNotes: string | null
  videoNotes: string | null
  metadataNotes: string | null
  onChange: () => void
}

const STEP_META: Record<Step, { label: string; icon: typeof FileCheck; description: string; evidenceHref: (borrowerId: string) => string; evidenceLabel: string }> = {
  docs: {
    label: 'Documents received & reviewed',
    icon: FileCheck,
    description: 'Confirm you received every document you requested by email and they look authentic (account holder name matches, dates plausible, no obvious tampering).',
    evidenceHref: () => `/l/document-requests`,
    evidenceLabel: 'Open document verification',
  },
  video: {
    label: 'Video attestation reviewed',
    icon: Video,
    description: 'Confirm the borrower emailed you a video stating their name, today\'s date and the loan amount, and that the file fingerprint matches the platform record.',
    evidenceHref: (bid) => `/l/borrowers/${bid}`,
    evidenceLabel: 'Open borrower profile',
  },
  metadata: {
    label: 'Identity & risk flags reviewed',
    icon: AlertTriangle,
    description: 'Confirm you\'ve reviewed the borrower\'s selfie risk score and any cross-borrower duplicate flags. Any high-risk signal has been acknowledged.',
    evidenceHref: (bid) => `/l/borrowers/${bid}/verify`,
    evidenceLabel: 'Open verification page',
  },
}

export function LoanVerificationChecklist(props: Props) {
  const supabase = createClient()
  const [busyStep, setBusyStep] = useState<Step | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState<Record<Step, string>>({ docs: '', video: '', metadata: '' })

  const stepState = (step: Step): { verifiedAt: string | null; notes: string | null } => {
    if (step === 'docs') return { verifiedAt: props.docsVerifiedAt, notes: props.docsNotes }
    if (step === 'video') return { verifiedAt: props.videoVerifiedAt, notes: props.videoNotes }
    return { verifiedAt: props.metadataVerifiedAt, notes: props.metadataNotes }
  }

  const completed = [props.docsVerifiedAt, props.videoVerifiedAt, props.metadataVerifiedAt].filter(Boolean).length
  const allDone = completed === 3
  const gateActive = props.loanStatus === 'pending_disbursement'

  const mark = async (step: Step) => {
    setBusyStep(step)
    setError(null)
    const { error } = await supabase.rpc('mark_loan_verification_step', {
      p_loan_id: props.loanId,
      p_step: step,
      p_notes: draftNotes[step] || null,
    })
    setBusyStep(null)
    if (error) {
      setError(error.message)
      return
    }
    setDraftNotes(prev => ({ ...prev, [step]: '' }))
    props.onChange()
  }

  const unmark = async (step: Step) => {
    setBusyStep(step)
    setError(null)
    const { error } = await supabase.rpc('unmark_loan_verification_step', {
      p_loan_id: props.loanId,
      p_step: step,
    })
    setBusyStep(null)
    if (error) {
      setError(error.message)
      return
    }
    props.onChange()
  }

  return (
    <Card className={allDone ? 'border-green-300 bg-green-50/30' : gateActive ? 'border-orange-300 bg-orange-50/30' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Pre-disbursement verification
          </span>
          <Badge variant={allDone ? 'default' : 'secondary'}>{completed}/3 complete</Badge>
        </CardTitle>
        <CardDescription>
          You must confirm these three checks before you can record sending money. The loan will not become active until you do this and the borrower confirms receipt of funds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {gateActive && !allDone && (
          <Alert className="bg-orange-100 border-orange-300">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Disbursement is blocked until all three checks are complete.
            </AlertDescription>
          </Alert>
        )}
        {allDone && (
          <Alert className="bg-green-100 border-green-300">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            <AlertDescription className="text-green-900">
              All verifications complete. You can now record disbursement below.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {(Object.keys(STEP_META) as Step[]).map(step => {
          const meta = STEP_META[step]
          const Icon = meta.icon
          const { verifiedAt, notes } = stepState(step)
          const isVerified = !!verifiedAt
          const isBusy = busyStep === step
          return (
            <div key={step} className={`rounded-lg border p-4 space-y-2 ${isVerified ? 'bg-white' : 'bg-muted/30'}`}>
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isVerified ? 'text-green-600' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{meta.label}</p>
                    {isVerified && <Badge variant="default" className="bg-green-600">Verified</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
                  <Link href={meta.evidenceHref(props.borrowerId)} className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
                    {meta.evidenceLabel} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {isVerified ? (
                <div className="pl-8 space-y-1">
                  <p className="text-xs text-muted-foreground">Verified {new Date(verifiedAt!).toLocaleString()}</p>
                  {notes && <p className="text-sm italic">"{notes}"</p>}
                  <Button variant="ghost" size="sm" onClick={() => unmark(step)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />}
                    Undo
                  </Button>
                </div>
              ) : (
                <div className="pl-8 space-y-2">
                  <Textarea
                    placeholder="Notes (optional) — what did you check, anything unusual?"
                    rows={2}
                    value={draftNotes[step]}
                    onChange={e => setDraftNotes(prev => ({ ...prev, [step]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => mark(step)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Mark verified
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
