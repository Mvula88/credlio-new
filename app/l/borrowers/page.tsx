'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { hashNationalIdAsync, formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Search,
  UserPlus,
  AlertCircle,
  CheckCircle,
  User,
  Calendar,
  Phone,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Shield,
  FileText,
  X,
  Check,
  Clock,
  Ban,
  Hash,
  FileCheck,
  Calculator,
  MapPin,
  Briefcase,
  Landmark,
  Users,
  Link as LinkIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function BorrowersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<any>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [registerDialog, setRegisterDialog] = useState(false)
  const [riskDialog, setRiskDialog] = useState(false)
  const [selectedBorrower, setSelectedBorrower] = useState<any>(null)
  const [riskyBorrowers, setRiskyBorrowers] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('search')
  const [loading, setLoading] = useState(false)
  const [createLoanDialog, setCreateLoanDialog] = useState(false)
  const [newlyRegisteredBorrowerId, setNewlyRegisteredBorrowerId] = useState<string | null>(null)
  const [newlyRegisteredNationalId, setNewlyRegisteredNationalId] = useState<string>('')
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null)

  // Risk listing form
  const [riskType, setRiskType] = useState<string>('LATE_1_7')
  const [riskReason, setRiskReason] = useState('')
  const [riskAmount, setRiskAmount] = useState('')
  const [proofHash, setProofHash] = useState('')
  
  // Register form
  const [registerData, setRegisterData] = useState({
    fullName: '',
    nationalId: '',
    phoneNumber: '',
    dateOfBirth: '',
  })

  const supabase = createClient()
  const router = useRouter()

  // Check lender profile completion on mount
  useEffect(() => {
    checkProfileCompletion()
  }, [])

  useEffect(() => {
    if (activeTab === 'risky') {
      loadRiskyBorrowers()
    }
  }, [activeTab])

  const checkProfileCompletion = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProfileCompleted(null)
        return
      }

      const { data: lender, error } = await supabase
        .from('lenders')
        .select('profile_completed, id_photo_uploaded_at')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Error checking profile:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // On error, assume profile might not be complete to be safe
        setProfileCompleted(false)
        return
      }

      // If no lender record exists, profile is not complete
      if (!lender) {
        setProfileCompleted(false)
        return
      }

      // Profile is complete if both fields are set
      const isComplete = Boolean(lender.profile_completed && lender.id_photo_uploaded_at)
      setProfileCompleted(isComplete)
    } catch (error) {
      console.error('Unexpected error checking profile:', error)
      setProfileCompleted(false)
    }
  }

  const loadRiskyBorrowers = async () => {
    try {
      setLoading(true)
      
      // Get risk flags with borrower info
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter National ID number')
      return
    }

    try {
      setSearchLoading(true)
      setSearchResult(null)

      // ONLY search by National ID (hashed) - most secure and unique identifier
      const idHash = await hashNationalIdAsync(searchQuery)

      const { data, error } = await supabase
        .from('borrowers')
        .select(`
          id,
          full_name,
          city,
          country_code,
          created_at,
          employment_status,
          monthly_income_range,
          has_social_media,
          street_address,
          emergency_contact_name,
          next_of_kin_name,
          bank_name,
          borrower_scores(score),
          loans(id, status),
          risk_flags(id, type, resolved_at, origin, created_by, reason),
          borrower_self_verification_status(
            verification_status,
            selfie_uploaded
          )
        `)
        .eq('national_id_hash', idHash)

      if (error) {
        console.error('Query error details:', error)
        throw error
      }

      if (!data || data.length === 0) {
        setSearchResult({ notFound: true })
      } else {
        // Take first result
        const borrower = Array.isArray(data) ? data[0] : data

        // Calculate how many unique lenders have reported this borrower
        const uniqueLenders = new Set(
          borrower.risk_flags
            ?.filter((f: any) => !f.resolved_at && f.origin === 'LENDER_REPORTED')
            .map((f: any) => f.created_by)
        )

        // Format the result with verification badges
        const verificationStatus = borrower.borrower_self_verification_status?.[0]

        setSearchResult({
          borrower_id: borrower.id,
          full_name: borrower.full_name,
          city: borrower.city,
          country_code: borrower.country_code,
          credit_score: borrower.borrower_scores?.[0]?.score || 500,
          active_loan: borrower.loans?.some((l: any) => l.status === 'active') || false,
          risk_flags_count: borrower.risk_flags?.filter((f: any) => !f.resolved_at).length || 0,
          listed_by_lenders: uniqueLenders.size,
          created_at: borrower.created_at,
          has_defaults: borrower.risk_flags?.some((f: any) => !f.resolved_at && f.type === 'DEFAULT') || false,
          risk_flags: borrower.risk_flags,
          // Loan history summary (show everything)
          total_loans: borrower.loans?.length || 0,
          completed_loans: borrower.loans?.filter((l: any) => l.status === 'completed').length || 0,
          // Verification badges (summary only - no sensitive data)
          verification_badges: {
            identity_verified: verificationStatus?.verification_status === 'approved',
            address_verified: !!borrower.street_address,
            employment_verified: !!borrower.employment_status,
            bank_verified: !!borrower.bank_name,
            contacts_verified: !!(borrower.emergency_contact_name && borrower.next_of_kin_name),
            digital_presence: borrower.has_social_media || false,
          },
          employment_status: borrower.employment_status,
          monthly_income_range: borrower.monthly_income_range,
        })
      }
    } catch (error: any) {
      console.error('Search error:', error)
      console.error('Error message:', error?.message)
      console.error('Error code:', error?.code)
      console.error('Error details:', error?.details)
      toast.error(error?.message || 'Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleRegister = async () => {
    try {
      setLoading(true)

      // Validate required fields
      if (!registerData.fullName || !registerData.nationalId || 
          !registerData.phoneNumber || !registerData.dateOfBirth) {
        toast.error('Please fill in all required fields')
        return
      }

      // Call register function
      const { data, error } = await supabase
        .rpc('register_borrower', {
          p_full_name: registerData.fullName,
          p_national_id: registerData.nationalId,
          p_phone: registerData.phoneNumber,
          p_date_of_birth: registerData.dateOfBirth,
        })

      if (error) throw error

      toast.success('Borrower registered successfully')
      setRegisterDialog(false)

      // Store borrower ID and national ID for quick actions
      setNewlyRegisteredBorrowerId(data)
      setNewlyRegisteredNationalId(registerData.nationalId)
      setCreateLoanDialog(true)

      setRegisterData({
        fullName: '',
        nationalId: '',
        phoneNumber: '',
        dateOfBirth: '',
      })
    } catch (error: any) {
      console.error('Registration error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      toast.error(error.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleListAsRisky = async () => {
    if (!selectedBorrower) return

    try {
      setLoading(true)

      // Validate inputs
      if (!riskReason || !proofHash) {
        toast.error('Please provide reason and proof document hash')
        return
      }

      // Call list as risky function
      const { data, error } = await supabase
        .rpc('list_borrower_as_risky', {
          p_borrower_id: selectedBorrower.borrower_id,
          p_risk_type: riskType,
          p_reason: riskReason,
          p_amount_minor: riskAmount ? parseInt(riskAmount) * 100 : null,
          p_proof_hash: proofHash,
        })

      if (error) throw error

      toast.success('Borrower listed as risky')
      setRiskDialog(false)
      setRiskType('LATE_1_7')
      setRiskReason('')
      setRiskAmount('')
      setProofHash('')
      
      // Refresh risky list
      if (activeTab === 'risky') {
        loadRiskyBorrowers()
      }
    } catch (error: any) {
      console.error('Risk listing error:', error)
      toast.error(error.message || 'Failed to list borrower as risky')
    } finally {
      setLoading(false)
    }
  }

  const handleResolveRisk = async (riskId: string) => {
    const reason = prompt('Please provide a resolution reason:')
    if (!reason) return

    try {
      setLoading(true)

      const { error } = await supabase
        .rpc('resolve_risk_flag', {
          p_risk_id: riskId,
          p_resolution_reason: reason,
        })

      if (error) throw error

      toast.success('Risk flag resolved')
      loadRiskyBorrowers()
    } catch (error: any) {
      console.error('Resolve error:', error)
      toast.error(error.message || 'Failed to resolve risk flag')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-green-600'
    if (score >= 600) return 'text-yellow-600'
    if (score >= 500) return 'text-orange-600'
    return 'text-red-600'
  }

  const getRiskBadge = (type: string) => {
    const badges: Record<string, { label: string; variant: any }> = {
      'LATE_1_7': { label: 'Late 1-7 days', variant: 'secondary' },
      'LATE_8_30': { label: 'Late 8-30 days', variant: 'secondary' },
      'LATE_31_60': { label: 'Late 31-60 days', variant: 'destructive' },
      'DEFAULT': { label: 'Defaulted', variant: 'destructive' },
      'CLEARED': { label: 'Cleared', variant: 'outline' },
    }
    return badges[type] || { label: type, variant: 'outline' }
  }

  const computeDocumentHash = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    setProofHash(hashHex)
    toast.success('Document hash computed: ' + hashHex.substring(0, 16) + '...')
  }


  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Borrower Management</h1>
        <p className="text-muted-foreground">Search for complete borrower profiles, register new borrowers to track</p>
      </div>

      {/* Tabs - Only Search/Register */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            Search & Register
          </TabsTrigger>
        </TabsList>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          {/* Profile Completion Check */}
          {profileCompleted === false ? (
            <Alert className="bg-orange-50 border-orange-200">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-900">
                <strong>Complete Your Profile First:</strong> You need to complete your lender profile before you can search for borrowers.{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-orange-900 underline font-semibold"
                  onClick={() => router.push('/l/complete-profile')}
                >
                  Click here to complete your profile
                </Button>
              </AlertDescription>
            </Alert>
          ) : profileCompleted === true ? (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                <strong>Full Borrower Profile Search:</strong> Search by National ID to view complete borrower information including credit score, loans, payment history, and more.
                To quickly check if someone is a defaulter or blacklisted, use the <strong>Credit Intelligence</strong> tab instead.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Search for Complete Borrower Profile</CardTitle>
              <CardDescription>
                Search by National ID number only - the most secure and unique identifier. Register new borrowers to track their credit.
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
                  disabled={profileCompleted === false}
                />

                <Button onClick={handleSearch} disabled={searchLoading || profileCompleted === false}>
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search by National ID
                </Button>

                <Dialog open={registerDialog} onOpenChange={setRegisterDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={profileCompleted === false}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Register New
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Register New Borrower to Track</DialogTitle>
                      <DialogDescription>
                        Add a borrower to start tracking their credit and loan activity (NOT for reporting defaults)
                      </DialogDescription>
                    </DialogHeader>
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-sm text-blue-900">
                        <strong>Note:</strong> To report someone who defaulted on you, use <strong>Credit Intelligence → Report Defaulter</strong> instead.
                        This form is only for registering borrowers you want to track.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-4">
                      <div>
                        <Label>Full Name *</Label>
                        <Input
                          value={registerData.fullName}
                          onChange={(e) => setRegisterData({...registerData, fullName: e.target.value})}
                          placeholder="As on national ID"
                        />
                      </div>
                      <div>
                        <Label>National ID *</Label>
                        <Input
                          value={registerData.nationalId}
                          onChange={(e) => setRegisterData({...registerData, nationalId: e.target.value})}
                          placeholder="National ID number"
                        />
                      </div>
                      <div>
                        <Label>Phone Number *</Label>
                        <Input
                          value={registerData.phoneNumber}
                          onChange={(e) => setRegisterData({...registerData, phoneNumber: e.target.value})}
                          placeholder="+264..."
                        />
                      </div>
                      <div>
                        <Label>Date of Birth *</Label>
                        <Input
                          type="date"
                          value={registerData.dateOfBirth}
                          onChange={(e) => setRegisterData({...registerData, dateOfBirth: e.target.value})}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRegisterDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleRegister} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Search Result */}
              {searchResult && (
                <Card className="mt-4">
                  {searchResult.notFound ? (
                    <CardContent className="py-8">
                      <div className="text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-muted mx-auto flex items-center justify-center">
                          <AlertCircle className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">Borrower Not Found</p>
                          <p className="text-sm text-muted-foreground mt-2">
                            No borrower found with this National ID number.
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            You need to register them first before creating a loan.
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setRegisterDialog(true)
                            // Pre-fill the National ID
                            setRegisterData({...registerData, nationalId: searchQuery})
                          }}
                          className="mt-4"
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Register This Borrower
                        </Button>
                      </div>
                    </CardContent>
                  ) : (
                    <CardContent className="pt-6">
                      <div className="space-y-6">
                        {/* Borrower Info - Summary Only */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="text-xl font-semibold">{searchResult.full_name}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              {searchResult.city && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {searchResult.city}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Member since {format(new Date(searchResult.created_at), 'MMM yyyy')}
                              </span>
                              {searchResult.employment_status && (
                                <span className="flex items-center gap-1">
                                  <Briefcase className="h-3 w-3" />
                                  {searchResult.employment_status.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-3xl font-bold">
                              <span className={getScoreColor(searchResult.credit_score)}>
                                {searchResult.credit_score}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">Credit Score</p>
                          </div>
                        </div>

                        {/* Verification Badges */}
                        {searchResult.verification_badges && (
                          <div className="p-4 bg-gray-50 rounded-lg border">
                            <p className="text-sm font-medium text-gray-700 mb-3">Information Provided Status</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={searchResult.verification_badges.identity_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.identity_verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Identity
                              </Badge>
                              <Badge className={searchResult.verification_badges.address_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.address_verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Address
                              </Badge>
                              <Badge className={searchResult.verification_badges.employment_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.employment_verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Employment
                              </Badge>
                              <Badge className={searchResult.verification_badges.bank_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.bank_verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Bank Info
                              </Badge>
                              <Badge className={searchResult.verification_badges.contacts_verified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.contacts_verified ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Contacts
                              </Badge>
                              <Badge className={searchResult.verification_badges.digital_presence ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                                {searchResult.verification_badges.digital_presence ? <CheckCircle className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                Social Media
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {Object.values(searchResult.verification_badges).filter(Boolean).length}/6 fields provided - Request documents to verify
                            </p>
                          </div>
                        )}

                        {/* Loan History Summary */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-blue-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-blue-900">{searchResult.total_loans}</p>
                            <p className="text-xs text-blue-700">Total Loans</p>
                          </div>
                          <div className="p-3 bg-green-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-green-900">{searchResult.completed_loans}</p>
                            <p className="text-xs text-green-700">Completed</p>
                          </div>
                          <div className="p-3 bg-purple-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-purple-900">{searchResult.monthly_income_range || 'N/A'}</p>
                            <p className="text-xs text-purple-700">Income Range</p>
                          </div>
                        </div>

                        {/* DEFAULTER WARNING - Prominent Alert */}
                        {searchResult.listed_by_lenders > 0 && (
                          <Alert className="bg-red-50 border-red-200 border-2">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            <AlertDescription className="text-red-900">
                              <strong className="text-lg block mb-2">⚠️ WARNING: Listed as Defaulter</strong>
                              <p className="mb-2">
                                This borrower has been reported by <strong>{searchResult.listed_by_lenders} lender{searchResult.listed_by_lenders > 1 ? 's' : ''}</strong> for defaulting/non-payment.
                              </p>
                              <div className="text-sm space-y-1 mt-2">
                                {searchResult.risk_flags?.slice(0, 3).map((flag: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <Ban className="h-3 w-3" />
                                    <span>{flag.type.replace('_', ' ')}: {flag.reason?.substring(0, 60)}...</span>
                                  </div>
                                ))}
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="mt-3"
                                onClick={() => router.push('/l/reports?tab=intelligence')}
                              >
                                View Full Default History
                              </Button>
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Status Badges */}
                        <div className="flex gap-2 flex-wrap">
                          {searchResult.active_loan && (
                            <Badge variant="secondary">
                              <CreditCard className="h-3 w-3 mr-1" />
                              Active Loan
                            </Badge>
                          )}
                          {searchResult.has_defaults && (
                            <Badge variant="destructive" className="bg-red-700 animate-pulse">
                              <Ban className="h-3 w-3 mr-1" />
                              HAS DEFAULTS
                            </Badge>
                          )}
                          {searchResult.risk_flags_count > 0 && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {searchResult.risk_flags_count} Risk Flag{searchResult.risk_flags_count > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {searchResult.listed_by_lenders > 0 && (
                            <Badge variant="destructive" className="bg-orange-600">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Reported by {searchResult.listed_by_lenders} lender{searchResult.listed_by_lenders > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {searchResult.risk_flags_count === 0 && !searchResult.active_loan && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Clean Record
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/l/borrowers/${searchResult.borrower_id}/verify`)}
                            className="border-primary text-primary hover:bg-primary hover:text-white"
                          >
                            <FileCheck className="h-4 w-4 mr-1" />
                            Verify Documents
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/l/affordability?borrower=${searchResult.borrower_id}`)}
                            className="border-secondary text-secondary hover:bg-secondary hover:text-white"
                          >
                            <Calculator className="h-4 w-4 mr-1" />
                            Affordability Check
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => router.push(`/l/loans/new?borrower=${searchResult.borrower_id}`)}
                            className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                          >
                            <CreditCard className="h-4 w-4 mr-1" />
                            Create Loan
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/l/borrowers/${searchResult.borrower_id}`)}
                          >
                            <User className="h-4 w-4 mr-1" />
                            View Profile
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBorrower(searchResult)
                              setRiskDialog(true)
                            }}
                            title="Flag this borrower as risky (also available in Credit Intelligence)"
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Flag as Risky
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risky List Tab */}
        <TabsContent value="risky" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Risky Borrowers</CardTitle>
              <CardDescription>
                Borrowers with active risk flags from all sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : riskyBorrowers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No risky borrowers found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Risk Type</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Listed By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riskyBorrowers.map((borrower) => (
                      <TableRow key={borrower.borrower_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{borrower.full_name}</p>
                            <p className="text-sm text-muted-foreground">{borrower.phone_e164}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge {...getRiskBadge(borrower.latestFlag.type)}>
                            {getRiskBadge(borrower.latestFlag.type).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={borrower.latestFlag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                            {borrower.latestFlag.origin === 'LENDER_REPORTED' ? 'Lender' : 'System'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {borrower.listedByCount > 0 && (
                            <span className="text-sm font-medium">
                              {borrower.listedByCount} lender{borrower.listedByCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(borrower.latestFlag.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolveRisk(borrower.latestFlag.id)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lender Reported Tab */}
        <TabsContent value="lender-reported" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lender Reported</CardTitle>
              <CardDescription>
                Borrowers manually flagged by lenders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                ) : (
                  <>
                    {riskyBorrowers.filter(b => b.latestFlag.origin === 'LENDER_REPORTED').length === 0
                      ? 'No lender-reported borrowers'
                      : `${riskyBorrowers.filter(b => b.latestFlag.origin === 'LENDER_REPORTED').length} lender-reported borrowers`}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Auto Tab */}
        <TabsContent value="system-auto" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Auto (Unconfirmed)</CardTitle>
              <CardDescription>
                Automatically flagged based on missed reporting deadlines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  These flags are unconfirmed and based on lenders not updating repayment status within the grace period.
                </AlertDescription>
              </Alert>
              <div className="text-center py-8 text-muted-foreground">
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                ) : (
                  <>
                    {riskyBorrowers.filter(b => b.latestFlag.origin === 'SYSTEM_AUTO').length === 0
                      ? 'No system-auto flags'
                      : `${riskyBorrowers.filter(b => b.latestFlag.origin === 'SYSTEM_AUTO').length} system-auto flags`}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Loan Prompt Dialog */}
      <Dialog open={createLoanDialog} onOpenChange={setCreateLoanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrower Registered Successfully!</DialogTitle>
            <DialogDescription>
              Would you like to create a loan for this borrower now?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={() => {
                setCreateLoanDialog(false)
                router.push(`/l/loans/new?borrower=${newlyRegisteredBorrowerId}`)
              }}
              className="w-full"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Create Loan Now
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreateLoanDialog(false)
                // Search for the newly registered borrower by National ID
                setSearchQuery(newlyRegisteredNationalId)
                setTimeout(() => handleSearch(), 100)
              }}
              className="w-full"
            >
              <Search className="h-4 w-4 mr-2" />
              View Borrower Profile
            </Button>
            <Button
              variant="ghost"
              onClick={() => setCreateLoanDialog(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Risk Listing Dialog */}
      <Dialog open={riskDialog} onOpenChange={setRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>List Borrower as Risky</DialogTitle>
            <DialogDescription>
              This will affect the borrower's credit score and visibility to other lenders
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
                  <SelectItem value="LATE_1_7">Late 1-7 days</SelectItem>
                  <SelectItem value="LATE_8_30">Late 8-30 days</SelectItem>
                  <SelectItem value="LATE_31_60">Late 31-60 days</SelectItem>
                  <SelectItem value="DEFAULT">Defaulted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={riskReason}
                onChange={(e) => setRiskReason(e.target.value)}
                placeholder="Provide detailed reason for listing..."
                rows={3}
              />
            </div>
            
            <div>
              <Label>Amount at Issue (Optional)</Label>
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
                  Upload document to compute hash. File never leaves your device.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleListAsRisky} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'List as Risky'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}