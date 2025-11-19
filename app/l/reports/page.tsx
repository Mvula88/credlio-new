'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { hashNationalIdAsync } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  FileText,
  Plus,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Mail,
  Loader2,
  AlertTriangle,
  Shield,
  Flag,
  Hash,
  UserPlus,
  Check,
  TrendingDown,
  Users,
  Info,
  Eye,
  X as CloseIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface Report {
  id: string
  borrower_id: string
  lender_id: string
  country_code: string
  currency: string
  amount_minor: number
  loan_date: string
  due_date: string | null
  status: 'unpaid' | 'paid' | 'disputed' | 'overdue'
  payment_date: string | null
  description: string | null
  borrower_confirmed: boolean
  borrower_response: string | null
  created_at: string
  borrower: {
    id: string
    full_name: string
    phone_e164: string
    country_code: string
  }
}

interface Borrower {
  id: string
  full_name: string
  phone_e164: string
  national_id_hash: string
  country_code: string
  user_id: string | null
}

const statusConfig = {
  unpaid: { label: 'Unpaid', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Paid', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  disputed: { label: 'Disputed', icon: AlertCircle, color: 'bg-red-100 text-red-800' },
  overdue: { label: 'Overdue', icon: XCircle, color: 'bg-red-100 text-red-800' }
}

const getRiskBadge = (type: string) => {
  const badges: Record<string, { label: string; variant: any; color: string }> = {
    'LATE_1_7': { label: 'Late 1-7 days', variant: 'secondary', color: 'bg-yellow-100 text-yellow-800' },
    'LATE_8_30': { label: 'Late 8-30 days', variant: 'secondary', color: 'bg-orange-100 text-orange-800' },
    'LATE_31_60': { label: 'Late 31-60 days', variant: 'destructive', color: 'bg-red-100 text-red-800' },
    'DEFAULT': { label: 'Defaulted', variant: 'destructive', color: 'bg-red-600 text-white' },
    'CLEARED': { label: 'Cleared', variant: 'outline', color: 'bg-green-100 text-green-800' },
  }
  return badges[type] || { label: type, variant: 'outline', color: 'bg-gray-100 text-gray-800' }
}

export default function LenderReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [riskyBorrowers, setRiskyBorrowers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [riskOriginFilter, setRiskOriginFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchHash, setSearchHash] = useState('')
  const [showFileDialog, setShowFileDialog] = useState(false)
  const [showRiskDialog, setShowRiskDialog] = useState(false)
  const [showQuickReportDialog, setShowQuickReportDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedRiskDetail, setSelectedRiskDetail] = useState<any>(null)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [selectedFlagToResolve, setSelectedFlagToResolve] = useState<any>(null)
  const [resolutionReason, setResolutionReason] = useState('')
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('intelligence')
  const router = useRouter()
  const supabase = createClient()

  // Form state for payment reports
  const [selectedBorrowerId, setSelectedBorrowerId] = useState('')
  const [amount, setAmount] = useState('')
  const [loanDate, setLoanDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reportStatus, setReportStatus] = useState<'unpaid' | 'overdue'>('unpaid')
  const [description, setDescription] = useState('')

  // Form state for risk flags
  const [riskSearchQuery, setRiskSearchQuery] = useState('')
  // REMOVED riskSearchType - now ONLY searches by National ID for security
  const [riskSearchResult, setRiskSearchResult] = useState<any>(null)
  const [riskSearchLoading, setRiskSearchLoading] = useState(false)
  const [selectedBorrowerForRisk, setSelectedBorrowerForRisk] = useState<any>(null)
  const [riskType, setRiskType] = useState<string>('DEFAULT')
  const [riskReason, setRiskReason] = useState('')
  const [riskAmount, setRiskAmount] = useState('')
  const [proofHash, setProofHash] = useState('')

  // Form state for quick report (unregistered borrower)
  const [quickReportData, setQuickReportData] = useState({
    fullName: '',
    nationalId: '',
    phoneNumber: '',
    dateOfBirth: '',
    riskType: 'DEFAULT',
    reason: '',
    amount: '',
    proofHash: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'intelligence' || activeTab === 'community') {
      loadRiskyBorrowers()
    }
  }, [activeTab])

  // Hash search term for National ID search
  useEffect(() => {
    const hashSearch = async () => {
      if (searchTerm.trim()) {
        const hash = await hashNationalIdAsync(searchTerm)
        setSearchHash(hash)
      } else {
        setSearchHash('')
      }
    }
    hashSearch()
  }, [searchTerm])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // Load payment reports
      const reportsResponse = await fetch('/api/reports')
      const reportsData = await reportsResponse.json()

      if (reportsResponse.ok) {
        setReports(reportsData.reports || [])
      }

      // Load borrowers for dropdown
      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (lender) {
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select('id, full_name, phone_e164, national_id_hash, country_code, user_id')
          .order('full_name')

        setBorrowers(borrowerData || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadRiskyBorrowers = async () => {
    try {
      setLoading(true)

      const { data: flags, error } = await supabase
        .from('risk_flags')
        .select(`
          *,
          borrowers (
            id,
            full_name,
            phone_e164,
            national_id_hash
          )
        `)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Group by borrower and count lenders
      const borrowerMap = new Map()

      flags?.forEach(flag => {
        const borrowerId = flag.borrower_id
        if (!borrowerMap.has(borrowerId)) {
          borrowerMap.set(borrowerId, {
            ...flag.borrowers,
            borrower_id: borrowerId,
            flags: [],
            lenderCount: new Set(),
            latestFlag: flag,
          })
        }

        const borrower = borrowerMap.get(borrowerId)
        borrower.flags.push(flag)
        if (flag.origin === 'LENDER_REPORTED' && flag.created_by) {
          borrower.lenderCount.add(flag.created_by)
        }
      })

      const riskyList = Array.from(borrowerMap.values()).map(b => ({
        ...b,
        listedByCount: b.lenderCount.size,
      }))

      setRiskyBorrowers(riskyList)
    } catch (error) {
      console.error('Error loading risky borrowers:', error)
      toast.error('Failed to load risky borrowers')
    } finally {
      setLoading(false)
    }
  }

  const handleFileReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!selectedBorrowerId || !amount || !loanDate) {
      setError('Please fill in all required fields')
      return
    }

    try {
      setSubmitting(true)

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrowerId: selectedBorrowerId,
          amount: parseFloat(amount),
          loanDate,
          dueDate: dueDate || null,
          status: reportStatus,
          description: description || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to file report')
      }

      toast.success('Payment report filed successfully')
      setShowFileDialog(false)

      // Reset form
      setSelectedBorrowerId('')
      setAmount('')
      setLoanDate('')
      setDueDate('')
      setReportStatus('unpaid')
      setDescription('')

      // Reload reports
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRiskSearch = async () => {
    if (!riskSearchQuery.trim()) {
      toast.error('Please enter National ID number')
      return
    }

    try {
      setRiskSearchLoading(true)
      setRiskSearchResult(null)

      // ONLY search by National ID (hashed) for security
      const idHash = await hashNationalIdAsync(riskSearchQuery)

      const { data, error } = await supabase
        .from('borrowers')
        .select(`
          *,
          borrower_scores(score),
          loans(id, status),
          risk_flags(id, type, resolved_at, origin, created_by, reason, created_at, amount_at_issue_minor)
        `)
        .eq('national_id_hash', idHash)

      if (error) throw error

      if (!data || data.length === 0) {
        setRiskSearchResult({ notFound: true })
      } else {
        const borrower = Array.isArray(data) ? data[0] : data

        // Calculate how many unique lenders have reported this borrower
        const uniqueLenders = new Set(
          borrower.risk_flags
            ?.filter((f: any) => !f.resolved_at && f.origin === 'LENDER_REPORTED')
            .map((f: any) => f.created_by)
        )

        setRiskSearchResult({
          borrower_id: borrower.id,
          full_name: borrower.full_name,
          phone_e164: borrower.phone_e164,
          date_of_birth: borrower.date_of_birth,
          country_code: borrower.country_code,
          credit_score: borrower.borrower_scores?.[0]?.score || 500,
          active_loan: borrower.loans?.some((l: any) => l.status === 'active') || false,
          risk_flags_count: borrower.risk_flags?.filter((f: any) => !f.resolved_at).length || 0,
          risk_flags: borrower.risk_flags?.filter((f: any) => !f.resolved_at) || [],
          listed_by_lenders: uniqueLenders.size,
          has_defaults: borrower.risk_flags?.some((f: any) => !f.resolved_at && f.type === 'DEFAULT') || false,
        })
      }
    } catch (error: any) {
      console.error('Search error:', error)
      toast.error(error?.message || 'Search failed. Please try again.')
    } finally {
      setRiskSearchLoading(false)
    }
  }

  const handleListAsRisky = async () => {
    if (!selectedBorrowerForRisk) return

    try {
      setSubmitting(true)

      if (!riskReason || !proofHash) {
        toast.error('Please provide reason and proof document hash')
        return
      }

      const { data, error } = await supabase
        .rpc('list_borrower_as_risky', {
          p_borrower_id: selectedBorrowerForRisk.borrower_id,
          p_risk_type: riskType,
          p_reason: riskReason,
          p_amount_minor: riskAmount ? parseInt(riskAmount) * 100 : null,
          p_proof_hash: proofHash,
        })

      if (error) throw error

      toast.success('Borrower flagged successfully - other lenders will be warned')
      setShowRiskDialog(false)
      setRiskType('DEFAULT')
      setRiskReason('')
      setRiskAmount('')
      setProofHash('')
      setSelectedBorrowerForRisk(null)
      setRiskSearchResult(null)

      if (activeTab === 'intelligence' || activeTab === 'community') {
        loadRiskyBorrowers()
      }
    } catch (error: any) {
      console.error('Risk listing error:', error)
      toast.error(error.message || 'Failed to flag borrower')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickReport = async () => {
    try {
      setSubmitting(true)

      // Validate required fields
      if (!quickReportData.fullName || !quickReportData.nationalId ||
          !quickReportData.phoneNumber || !quickReportData.dateOfBirth ||
          !quickReportData.reason || !quickReportData.proofHash) {
        toast.error('Please fill in all required fields')
        return
      }

      // First, register the borrower
      const { data: borrowerId, error: registerError } = await supabase
        .rpc('register_borrower', {
          p_full_name: quickReportData.fullName,
          p_national_id: quickReportData.nationalId,
          p_phone: quickReportData.phoneNumber,
          p_date_of_birth: quickReportData.dateOfBirth,
        })

      if (registerError) throw registerError

      // Then, flag them as risky
      const { error: flagError } = await supabase
        .rpc('list_borrower_as_risky', {
          p_borrower_id: borrowerId,
          p_risk_type: quickReportData.riskType,
          p_reason: quickReportData.reason,
          p_amount_minor: quickReportData.amount ? parseInt(quickReportData.amount) * 100 : null,
          p_proof_hash: quickReportData.proofHash,
        })

      if (flagError) throw flagError

      toast.success('⚠️ Defaulter registered and flagged! Other lenders will be warned.')
      setShowQuickReportDialog(false)

      // Reset form
      setQuickReportData({
        fullName: '',
        nationalId: '',
        phoneNumber: '',
        dateOfBirth: '',
        riskType: 'DEFAULT',
        reason: '',
        amount: '',
        proofHash: ''
      })

      // Refresh data
      if (activeTab === 'intelligence' || activeTab === 'community') {
        loadRiskyBorrowers()
      }
    } catch (error: any) {
      console.error('Quick report error:', error)
      toast.error(error.message || 'Failed to report defaulter')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResolveRisk = async () => {
    if (!selectedFlagToResolve || !resolutionReason.trim()) {
      toast.error('Please provide a resolution reason')
      return
    }

    try {
      setResolving(true)

      const { error } = await supabase
        .rpc('resolve_risk_flag', {
          p_risk_id: selectedFlagToResolve.latestFlag.id,
          p_resolution_reason: resolutionReason,
        })

      if (error) throw error

      toast.success('Risk flag resolved successfully! This borrower will no longer appear in the active risk list, but their history is preserved.')
      setShowResolveDialog(false)
      setSelectedFlagToResolve(null)
      setResolutionReason('')
      loadRiskyBorrowers()
    } catch (error: any) {
      console.error('Resolve error:', error)
      toast.error(error.message || 'Failed to resolve risk flag. You can only resolve flags you created or for loans you gave.')
    } finally {
      setResolving(false)
    }
  }

  const handleInvite = async (borrowerId: string) => {
    try {
      const borrower = borrowers.find(b => b.id === borrowerId)
      if (!borrower) return

      const response = await fetch('/api/reports/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrowerId,
          phone: borrower.phone_e164
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Invitation sent successfully')
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const computeDocumentHash = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setProofHash(hashHex)
    toast.success('Document hash computed: ' + hashHex.substring(0, 16) + '...')
  }

  const computeQuickReportHash = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setQuickReportData({ ...quickReportData, proofHash: hashHex })
    toast.success('Document hash computed: ' + hashHex.substring(0, 16) + '...')
  }

  const filteredReports = reports.filter(report => {
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter
    // ONLY search by National ID (hashed) for security
    const matchesSearch = !searchHash || report.borrower.national_id_hash === searchHash
    return matchesStatus && matchesSearch
  })

  const filteredRiskyBorrowers = riskyBorrowers.filter(borrower => {
    const matchesOrigin = riskOriginFilter === 'all' ||
      (riskOriginFilter === 'lender' && borrower.latestFlag.origin === 'LENDER_REPORTED') ||
      (riskOriginFilter === 'system' && borrower.latestFlag.origin === 'SYSTEM_AUTO')

    // ONLY search by National ID (hashed) for security
    const matchesSearch = !searchHash || borrower.national_id_hash === searchHash

    return matchesOrigin && matchesSearch
  })

  const systemAutoCount = riskyBorrowers.filter(b => b.latestFlag.origin === 'SYSTEM_AUTO').length
  const lenderReportedCount = riskyBorrowers.filter(b => b.latestFlag.origin === 'LENDER_REPORTED').length

  if (loading && activeTab === 'payment-reports') {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Credit Intelligence & Reports</h1>
        <p className="text-muted-foreground mt-1">
          System auto-flagged borrowers, community fraud alerts, and payment tracking
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="intelligence">
            <Shield className="h-4 w-4 mr-2" />
            Credit Intelligence
          </TabsTrigger>
          <TabsTrigger value="community">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Community Alerts
          </TabsTrigger>
          <TabsTrigger value="payment-reports">
            <FileText className="h-4 w-4 mr-2" />
            My Payment Tracking
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Credit Intelligence (System Auto-Flags - PRIMARY) */}
        <TabsContent value="intelligence" className="space-y-4">
          {/* Info Banner */}
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Automated Credit Tracking:</strong> These borrowers were automatically flagged by our system when their loans became overdue. This is real-time credit bureau data from all lenders on the platform.
            </AlertDescription>
          </Alert>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Risky Borrowers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{riskyBorrowers.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Active risk flags</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">System Auto-Flagged</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{systemAutoCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Automated tracking</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Community Reported</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{lenderReportedCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Manual fraud alerts</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by National ID number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setSearchTerm(searchTerm)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button variant="outline" disabled={!searchTerm.trim()}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                <Select value={riskOriginFilter} onValueChange={setRiskOriginFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="system">System Auto-Flagged</SelectItem>
                    <SelectItem value="lender">Community Reported</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Risky Borrowers Table */}
          <Card>
            <CardHeader>
              <CardTitle>All Risky Borrowers ({filteredRiskyBorrowers.length})</CardTitle>
              <CardDescription>
                Cross-lender credit intelligence - check before lending!
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRiskyBorrowers.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">
                    {searchHash ? 'Borrower Not Found' : 'No risky borrowers found'}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {searchHash
                      ? 'No borrower found with this National ID number in the risk database. This is good news - they have no risk flags!'
                      : riskyBorrowers.length === 0
                      ? 'No active risk flags in your country'
                      : 'Try adjusting your filters'}
                  </p>
                  {searchHash && (
                    <Alert className="mt-4 max-w-md mx-auto bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        This borrower has a clean record with no reported payment issues or defaults.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Risk Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Reported By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRiskyBorrowers.map((borrower) => {
                      const badge = getRiskBadge(borrower.latestFlag.type)
                      return (
                        <TableRow key={borrower.borrower_id} className="hover:bg-muted/50">
                          <TableCell>
                            <div>
                              <p className="font-medium">{borrower.full_name}</p>
                              <p className="text-sm text-muted-foreground">{borrower.phone_e164}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={badge.color}>
                              {badge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={borrower.latestFlag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                              {borrower.latestFlag.origin === 'LENDER_REPORTED' ? '👤 Lender' : '🤖 System'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {borrower.listedByCount > 0 ? (
                              <span className="text-sm font-medium text-orange-600">
                                {borrower.listedByCount} lender{borrower.listedByCount > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">Automated</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(borrower.latestFlag.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRiskDetail(borrower)
                                  setShowDetailDialog(true)
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/l/borrowers/${borrower.borrower_id}`)}
                              >
                                View Profile
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => {
                                  setSelectedFlagToResolve(borrower)
                                  setShowResolveDialog(true)
                                }}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Community Alerts (Manual Reports - SECONDARY) */}
        <TabsContent value="community" className="space-y-4">
          {/* Warning Banner */}
          <Alert className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-900">
              <strong>Community Fraud Protection:</strong> Report serial defaulters to protect other lenders. Even if they're not registered in our system, you can flag them here with proof.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Search Before Lending */}
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-900">
                  <Search className="h-5 w-5" />
                  Check for Defaults
                </CardTitle>
                <CardDescription className="text-orange-800">
                  Search by National ID number only - secure unique identifier. Shows default/fraud info if found.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter National ID number..."
                    value={riskSearchQuery}
                    onChange={(e) => setRiskSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRiskSearch()}
                    className="flex-1"
                  />
                </div>

                <Button onClick={handleRiskSearch} disabled={riskSearchLoading} className="w-full">
                  {riskSearchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Check Borrower
                    </>
                  )}
                </Button>

                {/* Search Result */}
                {riskSearchResult && (
                  <div className="mt-4 p-4 border rounded-lg bg-white">
                    {riskSearchResult.notFound ? (
                      <div className="text-center space-y-2">
                        <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
                        <p className="font-semibold">Not Found in System</p>
                        <p className="text-sm text-muted-foreground">
                          No reports found. If they default, use "Report Defaulter" →
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-semibold text-lg">{riskSearchResult.full_name}</h4>
                          <p className="text-sm text-muted-foreground">{riskSearchResult.phone_e164}</p>
                        </div>

                        {/* Warning if flagged */}
                        {riskSearchResult.listed_by_lenders > 0 && (
                          <Alert className="bg-red-50 border-red-200">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <AlertDescription className="text-red-900">
                              <strong className="text-lg">⚠️ WARNING: Reported by {riskSearchResult.listed_by_lenders} lender{riskSearchResult.listed_by_lenders > 1 ? 's' : ''}!</strong>
                              <div className="mt-2 space-y-1">
                                {riskSearchResult.risk_flags?.slice(0, 3).map((flag: any, idx: number) => (
                                  <div key={idx} className="text-sm">
                                    • {getRiskBadge(flag.type).label} - {format(new Date(flag.created_at), 'MMM d, yyyy')}
                                    {flag.reason && <div className="ml-4 text-xs italic">"{flag.reason.substring(0, 80)}..."</div>}
                                  </div>
                                ))}
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => router.push(`/l/borrowers/${riskSearchResult.borrower_id}`)}
                            className="flex-1"
                            variant="outline"
                          >
                            View Full Profile
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedBorrowerForRisk(riskSearchResult)
                              setShowRiskDialog(true)
                            }}
                            className="flex-1"
                            variant="destructive"
                          >
                            <Flag className="h-4 w-4 mr-2" />
                            Report Them Too
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Report Defaulter (Unregistered) */}
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <UserPlus className="h-5 w-5" />
                  Report a Defaulter
                </CardTitle>
                <CardDescription className="text-red-800">
                  Someone scammed you? Report them to warn other lenders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-yellow-50 border-yellow-200">
                  <Info className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-xs text-yellow-900">
                    Use this to report people who:
                    <ul className="list-disc ml-4 mt-1 space-y-1">
                      <li>Took money and disappeared</li>
                      <li>Are going around to different lenders</li>
                      <li>Have proof of default/non-payment</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <Dialog open={showQuickReportDialog} onOpenChange={setShowQuickReportDialog}>
                  <DialogTrigger asChild>
                    <Button className="w-full" variant="destructive" size="lg">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Report Defaulter Now
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Report a Defaulter</DialogTitle>
                      <DialogDescription>
                        Warn other lenders about someone who defaulted on you
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Full Name *</Label>
                          <Input
                            value={quickReportData.fullName}
                            onChange={(e) => setQuickReportData({...quickReportData, fullName: e.target.value})}
                            placeholder="As you know them"
                          />
                        </div>
                        <div>
                          <Label>National ID (if known)</Label>
                          <Input
                            value={quickReportData.nationalId}
                            onChange={(e) => setQuickReportData({...quickReportData, nationalId: e.target.value})}
                            placeholder="Leave blank if unknown"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Phone Number *</Label>
                          <Input
                            value={quickReportData.phoneNumber}
                            onChange={(e) => setQuickReportData({...quickReportData, phoneNumber: e.target.value})}
                            placeholder="+264..."
                          />
                        </div>
                        <div>
                          <Label>Date of Birth (if known)</Label>
                          <Input
                            type="date"
                            value={quickReportData.dateOfBirth}
                            onChange={(e) => setQuickReportData({...quickReportData, dateOfBirth: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-3">What happened?</h4>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Type of Default *</Label>
                            <Select
                              value={quickReportData.riskType}
                              onValueChange={(v) => setQuickReportData({...quickReportData, riskType: v})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DEFAULT">Defaulted / Never Paid</SelectItem>
                                <SelectItem value="LATE_31_60">Late 31-60 days</SelectItem>
                                <SelectItem value="LATE_8_30">Late 8-30 days</SelectItem>
                                <SelectItem value="LATE_1_7">Late 1-7 days</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Amount Lost (optional)</Label>
                            <Input
                              type="number"
                              value={quickReportData.amount}
                              onChange={(e) => setQuickReportData({...quickReportData, amount: e.target.value})}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <Label>Tell us what happened *</Label>
                          <Textarea
                            value={quickReportData.reason}
                            onChange={(e) => setQuickReportData({...quickReportData, reason: e.target.value})}
                            placeholder="Describe the situation: when they borrowed, what they promised, what happened..."
                            rows={4}
                          />
                        </div>

                        <div className="mt-4">
                          <Label>Proof Document Hash *</Label>
                          <div className="space-y-2">
                            <Input
                              value={quickReportData.proofHash}
                              onChange={(e) => setQuickReportData({...quickReportData, proofHash: e.target.value})}
                              placeholder="SHA-256 hash of proof document"
                            />
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept=".pdf,.jpg,.png"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) computeQuickReportHash(file)
                                }}
                                className="text-sm"
                              />
                              <Badge variant="secondary">
                                <Hash className="h-3 w-3 mr-1" />
                                Compute Hash
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Upload proof (messages, agreement, ID photo). File is processed locally and never uploaded.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowQuickReportDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleQuickReport} disabled={submitting} variant="destructive">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Report Defaulter'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>

          {/* Community Reported List */}
          <Card>
            <CardHeader>
              <CardTitle>Community Reported Defaulters ({lenderReportedCount})</CardTitle>
              <CardDescription>
                These people were manually reported by lenders in the community
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : lenderReportedCount === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No community reports yet</h3>
                  <p className="mt-2 text-muted-foreground">
                    Be the first to report a defaulter and protect the community
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {riskyBorrowers
                    .filter(b => b.latestFlag.origin === 'LENDER_REPORTED')
                    .map((borrower) => {
                      const badge = getRiskBadge(borrower.latestFlag.type)
                      return (
                        <div key={borrower.borrower_id} className="border rounded-lg p-4 hover:bg-muted/50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{borrower.full_name}</h4>
                                <Badge className={badge.color}>{badge.label}</Badge>
                                <Badge variant="destructive">
                                  {borrower.listedByCount} report{borrower.listedByCount > 1 ? 's' : ''}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{borrower.phone_e164}</p>
                              <p className="text-sm mt-2 text-muted-foreground">
                                Reported {format(new Date(borrower.latestFlag.created_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRiskDetail(borrower)
                                  setShowDetailDialog(true)
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Payment Tracking (Your private reports) */}
        <TabsContent value="payment-reports" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Track your private loan payment status and history (not visible to other lenders)
            </p>
            <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  File Payment Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>File Payment Report</DialogTitle>
                  <DialogDescription>
                    Document a loan or payment status with a borrower
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleFileReport}>
                  <div className="space-y-4">
                    <div>
                      <Label>Borrower *</Label>
                      <Select value={selectedBorrowerId} onValueChange={setSelectedBorrowerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select borrower" />
                        </SelectTrigger>
                        <SelectContent>
                          {borrowers.map((borrower) => (
                            <SelectItem key={borrower.id} value={borrower.id}>
                              {borrower.full_name} ({borrower.phone_e164})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="5000.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Loan Date *</Label>
                        <Input
                          type="date"
                          value={loanDate}
                          onChange={(e) => setLoanDate(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <Label>Due Date</Label>
                        <Input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Status *</Label>
                      <Select value={reportStatus} onValueChange={(value: any) => setReportStatus(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">Unpaid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Description</Label>
                      <Textarea
                        placeholder="Provide details about the loan and issue..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowFileDialog(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Filing...
                        </>
                      ) : (
                        'File Report'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by National ID number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setSearchTerm(searchTerm)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button variant="outline" disabled={!searchTerm.trim()}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Reports Table */}
          <Card>
            <CardHeader>
              <CardTitle>Reports ({filteredReports.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredReports.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium">
                    {searchHash ? 'No Payment Reports Found' : 'No reports found'}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {searchHash
                      ? 'No payment reports found for this National ID number. You have not reported any loans for this borrower yet.'
                      : reports.length === 0
                      ? 'Start by filing your first payment report'
                      : 'Try adjusting your filters'}
                  </p>
                  {searchHash && (
                    <Alert className="mt-4 max-w-md mx-auto bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800">
                        To check if other lenders have reported this borrower, switch to the "Credit Intelligence" tab.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Loan Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confirmed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => {
                      const StatusIcon = statusConfig[report.status].icon
                      const borrower = borrowers.find(b => b.id === report.borrower_id)
                      const isUnregistered = borrower && !borrower.user_id

                      return (
                        <TableRow key={report.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{report.borrower.full_name}</div>
                              <div className="text-sm text-muted-foreground">{report.borrower.phone_e164}</div>
                              {isUnregistered && (
                                <Badge variant="outline" className="mt-1">Unregistered</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: report.currency
                            }).format(report.amount_minor / 100)}
                          </TableCell>
                          <TableCell>{new Date(report.loan_date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {report.due_date ? new Date(report.due_date).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusConfig[report.status].color}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {statusConfig[report.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {report.borrower_confirmed ? (
                              <Badge className="bg-green-100 text-green-800">Yes</Badge>
                            ) : (
                              <Badge variant="outline">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isUnregistered && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleInvite(report.borrower_id)}
                              >
                                <Mail className="mr-1 h-3 w-3" />
                                Invite
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Risk Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Risk Flag Details</DialogTitle>
            <DialogDescription>
              Detailed information about this borrower's risk flags
            </DialogDescription>
          </DialogHeader>
          {selectedRiskDetail && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedRiskDetail.full_name}</h3>
                <p className="text-sm text-muted-foreground">{selectedRiskDetail.phone_e164}</p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">All Risk Flags ({selectedRiskDetail.flags?.length || 0})</h4>
                <div className="space-y-3">
                  {selectedRiskDetail.flags?.map((flag: any, idx: number) => {
                    const badge = getRiskBadge(flag.type)
                    return (
                      <div key={idx} className="border rounded-lg p-3 bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={badge.color}>{badge.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(flag.created_at), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>
                        <p className="text-sm"><strong>Origin:</strong> {flag.origin === 'LENDER_REPORTED' ? 'Lender Reported' : 'System Auto'}</p>
                        {flag.reason && <p className="text-sm mt-1"><strong>Reason:</strong> {flag.reason}</p>}
                        {flag.amount_at_issue_minor && (
                          <p className="text-sm mt-1">
                            <strong>Amount:</strong> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'NAD' }).format(flag.amount_at_issue_minor / 100)}
                          </p>
                        )}
                        {flag.proof_sha256 && (
                          <p className="text-sm mt-1 font-mono text-xs">
                            <strong>Proof:</strong> {flag.proof_sha256.substring(0, 16)}...
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Close
            </Button>
            {selectedRiskDetail && (
              <Button onClick={() => router.push(`/l/borrowers/${selectedRiskDetail.borrower_id}`)}>
                View Full Profile
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Flagging Dialog */}
      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Borrower</DialogTitle>
            <DialogDescription>
              Add your report - other lenders will be warned
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Risk Type *</Label>
              <Select value={riskType} onValueChange={setRiskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFAULT">Defaulted / Never Paid</SelectItem>
                  <SelectItem value="LATE_31_60">Late 31-60 days</SelectItem>
                  <SelectItem value="LATE_8_30">Late 8-30 days</SelectItem>
                  <SelectItem value="LATE_1_7">Late 1-7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>What happened? *</Label>
              <Textarea
                value={riskReason}
                onChange={(e) => setRiskReason(e.target.value)}
                placeholder="Describe the situation..."
                rows={3}
              />
            </div>

            <div>
              <Label>Amount at Issue (optional)</Label>
              <Input
                type="number"
                value={riskAmount}
                onChange={(e) => setRiskAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Proof Document Hash *</Label>
              <div className="space-y-2">
                <Input
                  value={proofHash}
                  onChange={(e) => setProofHash(e.target.value)}
                  placeholder="SHA-256 hash of proof document"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) computeDocumentHash(file)
                    }}
                    className="text-sm"
                  />
                  <Badge variant="secondary">
                    <Hash className="h-3 w-3 mr-1" />
                    Compute Hash
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload proof. File processed locally and never uploaded.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleListAsRisky} disabled={submitting} variant="destructive">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Risk Flag Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Risk Flag</DialogTitle>
            <DialogDescription>
              Mark this borrower as cleared. The flag will be resolved and they will no longer appear in the active risk list, but their history will be preserved.
            </DialogDescription>
          </DialogHeader>
          {selectedFlagToResolve && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{selectedFlagToResolve.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedFlagToResolve.phone_e164}</p>
                <Badge className={getRiskBadge(selectedFlagToResolve.latestFlag.type).color + ' mt-2'}>
                  {getRiskBadge(selectedFlagToResolve.latestFlag.type).label}
                </Badge>
                {selectedFlagToResolve.latestFlag.origin === 'LENDER_REPORTED' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Origin: Manual Report
                  </p>
                )}
                {selectedFlagToResolve.latestFlag.origin === 'SYSTEM_AUTO' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Origin: System Auto-Flag
                  </p>
                )}
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-900">
                  <strong>Note:</strong> You can only resolve flags for:
                  <ul className="list-disc list-inside mt-1 ml-2">
                    <li>Manual reports you created</li>
                    <li>System flags for loans you gave</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div>
                <Label>Resolution Reason *</Label>
                <Textarea
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="e.g., Borrower paid all outstanding amount on [date]"
                  rows={4}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Explain why this flag is being resolved (e.g., payment received, dispute resolved, etc.)
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResolveDialog(false)
                setSelectedFlagToResolve(null)
                setResolutionReason('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveRisk}
              disabled={resolving || !resolutionReason.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Resolve Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
