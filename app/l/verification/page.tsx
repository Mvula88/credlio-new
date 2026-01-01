'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { hashNationalIdAsync } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ShieldCheck,
  Shield,
  CheckCircle,
  Clock,
  Loader2,
  AlertTriangle,
  User,
  Search,
  FileCheck,
  ExternalLink,
  Info,
  Users
} from 'lucide-react'
import { toast } from 'sonner'

interface Borrower {
  id: string
  full_name: string
  phone_e164: string
  country_code: string
  created_at: string
  verification_status?: string
  documents_verified?: number
  total_documents?: number
  risk_score?: number
}

export default function VerificationPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<Borrower | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [recentBorrowers, setRecentBorrowers] = useState<Borrower[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadRecentBorrowers()
  }, [])

  // Load lender's recent borrowers (ones they have loans with)
  const loadRecentBorrowers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get borrowers from this lender's loans
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          borrower_id,
          borrowers (
            id,
            full_name,
            phone_e164,
            country_code,
            created_at
          )
        `)
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (loansError) throw loansError

      // Get unique borrowers
      const borrowerMap = new Map<string, Borrower>()
      loansData?.forEach((loan: any) => {
        const borrower = loan.borrowers as any
        if (borrower && !borrowerMap.has(borrower.id)) {
          borrowerMap.set(borrower.id, {
            id: borrower.id,
            full_name: borrower.full_name,
            phone_e164: borrower.phone_e164,
            country_code: borrower.country_code,
            created_at: borrower.created_at
          })
        }
      })

      const borrowersData = Array.from(borrowerMap.values())

      // Get verification status for each borrower
      const borrowersWithVerification = await Promise.all(
        borrowersData.map(async (borrower) => {
          const { data: verifications } = await supabase
            .from('document_verifications')
            .select('id, status, risk_score')
            .eq('borrower_id', borrower.id)

          const verifiedCount = verifications?.filter((v: any) => v.status === 'verified').length || 0
          const totalCount = verifications?.length || 0
          const avgRiskScore = verifications && verifications.length > 0
            ? Math.round(verifications.reduce((sum: number, v: any) => sum + (v.risk_score || 0), 0) / verifications.length)
            : null

          let status = 'not_started'
          if (totalCount > 0) {
            if (verifiedCount >= 4) {
              status = 'complete'
            } else if (verifications?.some((v: any) => v.status === 'flagged')) {
              status = 'flagged'
            } else {
              status = 'in_progress'
            }
          }

          return {
            ...borrower,
            verification_status: status,
            documents_verified: verifiedCount,
            total_documents: totalCount,
            risk_score: avgRiskScore
          }
        })
      )

      setRecentBorrowers(borrowersWithVerification as any)
    } catch (error) {
      console.error('Error loading recent borrowers:', error)
    } finally {
      setLoadingRecent(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter National ID number')
      return
    }

    try {
      setSearchLoading(true)
      setSearchResult(null)
      setNotFound(false)

      // Search by National ID (hashed)
      const idHash = await hashNationalIdAsync(searchQuery)

      const { data, error } = await supabase
        .from('borrowers')
        .select('id, full_name, phone_e164, country_code, created_at')
        .eq('national_id_hash', idHash)
        .single()

      if (error || !data) {
        setNotFound(true)
        return
      }

      // Get verification status
      const { data: verifications } = await supabase
        .from('document_verifications')
        .select('id, status, risk_score')
        .eq('borrower_id', data.id)

      const verifiedCount = verifications?.filter((v: any) => v.status === 'verified').length || 0
      const totalCount = verifications?.length || 0
      const avgRiskScore = verifications && verifications.length > 0
        ? Math.round(verifications.reduce((sum: number, v: any) => sum + (v.risk_score || 0), 0) / verifications.length)
        : null

      let status = 'not_started'
      if (totalCount > 0) {
        if (verifiedCount >= 4) {
          status = 'complete'
        } else if (verifications?.some((v: any) => v.status === 'flagged')) {
          status = 'flagged'
        } else {
          status = 'in_progress'
        }
      }

      setSearchResult({
        ...data,
        verification_status: status,
        documents_verified: verifiedCount,
        total_documents: totalCount,
        risk_score: avgRiskScore
      } as any)

    } catch (error: any) {
      console.error('Search error:', error)
      toast.error('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Complete
          </Badge>
        )
      case 'in_progress':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        )
      case 'flagged':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Flagged
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Not Started
          </Badge>
        )
    }
  }

  const stats = {
    total: recentBorrowers.length,
    complete: recentBorrowers.filter(b => b.verification_status === 'complete').length,
    inProgress: recentBorrowers.filter(b => b.verification_status === 'in_progress').length,
    flagged: recentBorrowers.filter(b => b.verification_status === 'flagged').length,
    notStarted: recentBorrowers.filter(b => b.verification_status === 'not_started').length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          Document Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify borrower documents to prevent fraud and ensure compliance
        </p>
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search Borrower to Verify
          </CardTitle>
          <CardDescription>
            Enter the borrower's National ID to find them and verify their documents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder="Enter National ID Number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchLoading}>
              {searchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>

          {/* Search Result */}
          {notFound && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No borrower found with this National ID. They need to be registered first before you can verify their documents.
              </AlertDescription>
            </Alert>
          )}

          {searchResult && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{searchResult.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{searchResult.phone_e164}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Documents</p>
                      <p className="font-medium">{searchResult.documents_verified || 0} / 5 verified</p>
                    </div>
                    {getStatusBadge(searchResult.verification_status || 'not_started')}
                    <Button onClick={() => router.push(`/l/borrowers/${searchResult.id}/verify`)}>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Verify Documents
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards - for your borrowers */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Borrowers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{stats.complete}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Flagged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">{stats.flagged}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Not Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.notStarted}</div>
          </CardContent>
        </Card>
      </div>

      {/* Your Recent Borrowers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Your Borrowers - Quick Access
              </CardTitle>
              <CardDescription>
                Borrowers you've given loans to - click to re-verify before new loans
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRecent ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recentBorrowers.length === 0 ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No borrowers yet. Search for a borrower above to verify their documents.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBorrowers.map((borrower) => (
                    <TableRow key={borrower.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{borrower.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {borrower.phone_e164}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          borrower.documents_verified && borrower.documents_verified >= 4 ? 'text-green-600' : 'text-muted-foreground'
                        }`}>
                          {borrower.documents_verified || 0} / 5 verified
                        </span>
                      </TableCell>
                      <TableCell>
                        {borrower.risk_score !== null && borrower.risk_score !== undefined ? (
                          <span className={`font-bold ${
                            borrower.risk_score <= 30 ? 'text-green-600' :
                            borrower.risk_score <= 60 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {borrower.risk_score}/100
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(borrower.verification_status || 'not_started')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/l/borrowers/${borrower.id}/verify`)}
                        >
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          Verify
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
