'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Fingerprint, ArrowRight, AlertTriangle, ExternalLink } from 'lucide-react'

type SelfieDup = {
  id: string
  borrower_id: string
  document_type: string
  perceptual_hash: string | null
  cross_borrower_match_borrower_id: string
  risk_score: number | null
  risk_factors: string[] | null
  uploaded_at: string
  borrowers: { full_name: string | null; country_code: string | null } | null
  matched: { full_name: string | null; country_code: string | null } | null
}

type DocDup = {
  id: string
  borrower_id: string
  document_type: string
  document_name: string
  perceptual_hash: string | null
  cross_borrower_match_borrower_id: string
  risk_score: number | null
  risk_level: string | null
  created_at: string
  borrowers: { full_name: string | null; country_code: string | null } | null
  matched: { full_name: string | null; country_code: string | null } | null
}

export default function AdminDuplicatesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [selfieDups, setSelfieDups] = useState<SelfieDup[]>([])
  const [docDups, setDocDups] = useState<DocDup[]>([])

  useEffect(() => {
    void (async () => {
      // Selfie / borrower_documents matches.
      const { data: selfies } = await supabase
        .from('borrower_documents')
        .select('id, borrower_id, document_type, perceptual_hash, cross_borrower_match_borrower_id, risk_score, risk_factors, uploaded_at, borrowers!borrower_id(full_name, country_code)')
        .not('cross_borrower_match_borrower_id', 'is', null)
        .order('uploaded_at', { ascending: false })
        .limit(500)

      // Enrich with matched-borrower display info (separate query because
      // the supabase-js relationship would need a second FK alias).
      const matchedIds = (selfies ?? []).map((s: any) => s.cross_borrower_match_borrower_id).filter(Boolean)
      const { data: matchedBorrowers } = matchedIds.length
        ? await supabase.from('borrowers').select('id, full_name, country_code').in('id', matchedIds)
        : { data: [] as any[] }
      const matchedById = new Map((matchedBorrowers ?? []).map((b: any) => [b.id, b]))

      setSelfieDups((selfies ?? []).map((s: any) => ({ ...s, matched: matchedById.get(s.cross_borrower_match_borrower_id) ?? null })))

      // document_verifications matches.
      const { data: docs } = await supabase
        .from('document_verifications')
        .select('id, borrower_id, document_type, document_name, perceptual_hash, cross_borrower_match_borrower_id, risk_score, risk_level, created_at, borrowers!borrower_id(full_name, country_code)')
        .not('cross_borrower_match_borrower_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)

      const docMatchedIds = (docs ?? []).map((d: any) => d.cross_borrower_match_borrower_id).filter(Boolean)
      const { data: docMatched } = docMatchedIds.length
        ? await supabase.from('borrowers').select('id, full_name, country_code').in('id', docMatchedIds)
        : { data: [] as any[] }
      const docMatchedById = new Map((docMatched ?? []).map((b: any) => [b.id, b]))

      setDocDups((docs ?? []).map((d: any) => ({ ...d, matched: docMatchedById.get(d.cross_borrower_match_borrower_id) ?? null })))

      setLoading(false)
    })()
  }, [supabase])

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fingerprint className="h-6 w-6 text-red-600" />
          Cross-Borrower Duplicates
        </h1>
        <p className="text-muted-foreground text-sm">
          The platform detected that the same image fingerprint (perceptual hash) is being used under two different borrower accounts. Each pair is either rented documents, the same person re-registering, or — rarely — a coincidence. Review each pair.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="selfies" className="space-y-4">
          <TabsList>
            <TabsTrigger value="selfies">Selfie matches ({selfieDups.length})</TabsTrigger>
            <TabsTrigger value="docs">Document matches ({docDups.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="selfies">
            {selfieDups.length === 0 ? (
              <EmptyState title="No selfie duplicates detected." />
            ) : (
              <div className="space-y-3">
                {selfieDups.map(r => (
                  <DupCard
                    key={r.id}
                    leftName={r.borrowers?.full_name ?? 'Unknown'}
                    leftId={r.borrower_id}
                    leftCountry={r.borrowers?.country_code ?? ''}
                    rightName={r.matched?.full_name ?? 'Unknown'}
                    rightId={r.cross_borrower_match_borrower_id}
                    rightCountry={r.matched?.country_code ?? ''}
                    docLabel={`${r.document_type} · risk ${r.risk_score ?? '?'}/100`}
                    hash={r.perceptual_hash}
                    timestamp={r.uploaded_at}
                    riskFactors={r.risk_factors ?? []}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="docs">
            {docDups.length === 0 ? (
              <EmptyState title="No lender-uploaded document duplicates detected." />
            ) : (
              <div className="space-y-3">
                {docDups.map(r => (
                  <DupCard
                    key={r.id}
                    leftName={r.borrowers?.full_name ?? 'Unknown'}
                    leftId={r.borrower_id}
                    leftCountry={r.borrowers?.country_code ?? ''}
                    rightName={r.matched?.full_name ?? 'Unknown'}
                    rightId={r.cross_borrower_match_borrower_id}
                    rightCountry={r.matched?.country_code ?? ''}
                    docLabel={`${r.document_name || r.document_type} · ${r.risk_level ?? r.risk_score + '/100'}`}
                    hash={r.perceptual_hash}
                    timestamp={r.created_at}
                    riskFactors={[]}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function DupCard(props: {
  leftName: string; leftId: string; leftCountry: string
  rightName: string; rightId: string; rightCountry: string
  docLabel: string
  hash: string | null
  timestamp: string
  riskFactors: string[]
}) {
  return (
    <Card className="border-red-300 bg-red-50/30">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/admin/borrowers/${props.leftId}`} className="flex-1 min-w-0 hover:underline">
            <p className="font-semibold truncate">{props.leftName}</p>
            <p className="text-xs text-muted-foreground">{props.leftCountry} · {props.leftId.slice(0, 8)}</p>
          </Link>
          <ArrowRight className="h-5 w-5 text-red-600 flex-shrink-0" />
          <Link href={`/admin/borrowers/${props.rightId}`} className="flex-1 min-w-0 text-right hover:underline">
            <p className="font-semibold truncate">{props.rightName}</p>
            <p className="text-xs text-muted-foreground">{props.rightCountry} · {props.rightId.slice(0, 8)}</p>
          </Link>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <Badge variant="destructive">{props.docLabel}</Badge>
          <span className="text-muted-foreground font-mono">{props.hash ? `hash ${props.hash.slice(0, 12)}…` : ''}</span>
          <span className="text-muted-foreground">{new Date(props.timestamp).toLocaleDateString()}</span>
        </div>
        {props.riskFactors.length > 0 && (
          <ul className="text-xs space-y-0.5">
            {props.riskFactors.map((f, i) => (
              <li key={i} className="flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        {title}
      </CardContent>
    </Card>
  )
}
