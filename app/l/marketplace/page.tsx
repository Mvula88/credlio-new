'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import {
  ShoppingBag,
  Search,
  Filter,
  User,
  TrendingUp,
  Calendar,
  DollarSign,
  Percent,
  AlertCircle,
  Lock,
  Star,
  Clock,
  CheckCircle,
  Send,
  Eye,
  Bell,
  Save,
  Trash2,
  Award,
  MessageSquare,
  Flag,
  TrendingDown,
  Shield,
  MapPin,
  Briefcase,
  Landmark,
  Phone,
  Users,
  Link as LinkIcon,
  ExternalLink,
  X
} from 'lucide-react'
import { format } from 'date-fns'
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'

export default function MarketplacePage() {
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const [loanRequests, setLoanRequests] = useState<any[]>([])
  const [myOffers, setMyOffers] = useState<any[]>([])
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerRate, setOfferRate] = useState('')
  const [offerTerms, setOfferTerms] = useState('')
  const [submittingOffer, setSubmittingOffer] = useState(false)
  const [lenderCurrency, setLenderCurrency] = useState<CurrencyInfo | null>(null)
  const [filters, setFilters] = useState({
    minScore: 500,
    maxAmount: 100000,
    country: '',
  })
  const [savedSearches, setSavedSearches] = useState<any[]>([])
  const [showSaveSearch, setShowSaveSearch] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [lenderReputation, setLenderReputation] = useState<any>(null)
  const [messageThreads, setMessageThreads] = useState<any[]>([])
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [selectedThread, setSelectedThread] = useState<any>(null)
  const [newMessage, setNewMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // All users have access now - usage limits will be added later
      setHasAccess(true)
      loadMarketplaceData()
    } catch (error) {
      console.error('Error checking access:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMarketplaceData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) return

      // Get lender's country and currency
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      if (profile?.country_code) {
        const { data: currencyData } = await supabase
          .from('country_currency_allowed')
          .select('currency_code, currency_symbol, minor_units')
          .eq('country_code', profile.country_code)
          .eq('is_default', true)
          .single()

        if (currencyData) {
          setLenderCurrency({
            code: currencyData.currency_code,
            symbol: currencyData.currency_symbol,
            minorUnits: currencyData.minor_units,
            countryCode: profile.country_code
          })
        }
      }

      // Get lender reputation
      const { data: reputation } = await supabase
        .from('lender_reputation')
        .select('*')
        .eq('lender_id', lender.user_id)
        .single()

      setLenderReputation(reputation)

      // Get saved searches
      const { data: searches } = await supabase
        .from('lender_saved_searches')
        .select('*')
        .eq('lender_id', lender.user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      setSavedSearches(searches || [])

      // CRITICAL: Only show loan requests from the SAME COUNTRY as the lender
      // Get loan requests from borrowers with full verification details
      const { data: requests } = await supabase
        .from('loan_requests')
        .select(`
          *,
          borrowers(
            id,
            full_name,
            phone_e164,
            country_code,
            date_of_birth,
            city,
            street_address,
            postal_code,
            employment_status,
            employer_name,
            monthly_income_range,
            income_source,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            next_of_kin_name,
            next_of_kin_phone,
            next_of_kin_relationship,
            bank_name,
            bank_account_number,
            bank_account_name,
            linkedin_url,
            facebook_url,
            has_social_media,
            created_at,
            borrower_scores(score),
            borrower_self_verification_status(verification_status)
          ),
          loan_offers(
            id,
            lender_id,
            status
          )
        `)
        .eq('status', 'open')
        .eq('country_code', profile.country_code) // COUNTRY FILTER: Only same country
        .order('created_at', { ascending: false })

      // Keep amounts in minor units, convert only interest rates
      const formattedRequests = requests?.map(r => ({
        ...r,
        amount_minor: r.amount_minor, // Keep in minor units
        max_interest_rate: r.max_apr_bps / 100,
      }))

      // Get my offers
      const { data: offers } = await supabase
        .from('loan_offers')
        .select(`
          *,
          loan_requests(
            *,
            borrowers(
              full_name,
              phone_e164
            )
          )
        `)
        .eq('lender_id', lender.user_id)
        .order('created_at', { ascending: false })

      // Keep offer amounts in minor units
      const formattedOffers = offers?.map(o => ({
        ...o,
        amount_minor: o.amount_minor, // Keep in minor units
        interest_rate: o.apr_bps / 100,
        loan_requests: {
          ...o.loan_requests,
          amount: o.loan_requests?.amount_minor / 100,
        }
      }))

      // Get message threads
      const { data: threads } = await supabase
        .from('message_threads')
        .select(`
          *,
          loan_requests(id, purpose),
          borrowers(full_name)
        `)
        .eq('lender_id', lender.user_id)
        .eq('status', 'active')
        .order('last_message_at', { ascending: false })

      setMessageThreads(threads || [])
      setLoanRequests(formattedRequests || [])
      setMyOffers(formattedOffers || [])
    } catch (error) {
      console.error('Error loading marketplace:', error)
    }
  }

  const saveCurrentSearch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) return

      const { error } = await supabase
        .from('lender_saved_searches')
        .insert({
          lender_id: lender.user_id,
          search_name: searchName,
          min_credit_score: filters.minScore,
          max_amount_minor: Math.round(filters.maxAmount * 100),
          notify_on_match: true,
        })

      if (error) {
        console.error('Error saving search:', error)
        return
      }

      await loadMarketplaceData()
      setShowSaveSearch(false)
      setSearchName('')
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const deleteSavedSearch = async (searchId: string) => {
    try {
      await supabase
        .from('lender_saved_searches')
        .update({ is_active: false })
        .eq('id', searchId)

      await loadMarketplaceData()
    } catch (error) {
      console.error('Error deleting search:', error)
    }
  }

  const applySavedSearch = (search: any) => {
    setFilters({
      minScore: search.min_credit_score || 500,
      maxAmount: search.max_amount_minor / 100,
      country: search.country_codes?.[0] || '',
    })
  }

  const submitOffer = async () => {
    if (!selectedRequest || !offerAmount || !offerRate || !offerTerms) return

    try {
      setSubmittingOffer(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: lender } = await supabase
        .from('lenders')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!lender) return

      // Create loan offer
      const { data: offerData, error } = await supabase
        .from('loan_offers')
        .insert({
          request_id: selectedRequest.id,
          lender_id: lender.user_id,
          amount_minor: Math.round(parseFloat(offerAmount) * 100), // Convert to cents
          apr_bps: Math.round(parseFloat(offerRate) * 100), // Convert to basis points
          term_months: parseInt(offerTerms),
          status: 'pending',
        })
        .select()
        .single()

      if (error) {
        console.error('Error submitting offer:', error)
        return
      }

      // Create message thread for this offer
      const { error: threadError } = await supabase
        .from('message_threads')
        .insert({
          request_id: selectedRequest.id,
          offer_id: offerData.id,
          lender_id: lender.user_id,
          borrower_id: selectedRequest.borrower_id,
          status: 'active',
          last_message_at: new Date().toISOString()
        })

      if (threadError) {
        console.error('Error creating message thread:', threadError)
        // Don't return - offer was still created successfully
      }

      // Reload data
      await loadMarketplaceData()
      
      // Reset form
      setSelectedRequest(null)
      setOfferAmount('')
      setOfferRate('')
      setOfferTerms('')
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSubmittingOffer(false)
    }
  }

  const getRiskLevel = (score: number) => {
    if (score >= 700) return { label: 'Low Risk', color: 'bg-green-100 text-green-800' }
    if (score >= 550) return { label: 'Medium Risk', color: 'bg-yellow-100 text-yellow-800' }
    return { label: 'High Risk', color: 'bg-red-100 text-red-800' }
  }

  const formatCurrency = (amountMinor: number) => {
    if (!lenderCurrency) {
      // Fallback to USD if currency info not loaded yet
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(amountMinor / 100)
    }
    return formatCurrencyUtil(amountMinor, lenderCurrency)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl">Loan Requests Access Required</CardTitle>
            <CardDescription>
              Upgrade to Pro+ to access loan requests from borrowers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-blue-200 bg-blue-50">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              <AlertTitle>What are Loan Requests?</AlertTitle>
              <AlertDescription>
                Browse requests from borrowers seeking loans and make competitive offers. 
                You can browse loan requests, make competitive offers, and expand your lending portfolio beyond your registered borrowers.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="font-semibold">Pro+ Benefits ($19.99/month)</h3>
              <ul className="space-y-2">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Access to all borrower loan requests</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Make competitive loan offers</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Expand beyond your registered borrowers</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Advanced filtering and search</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Priority support</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-center">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                onClick={() => router.push('/l/billing')}
              >
                Upgrade to Pro+ →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Loan Requests</h1>
        <p className="text-gray-600 mt-1">Browse loan requests and make competitive offers</p>
      </div>

      {/* Lender Reputation Card */}
      {lenderReputation && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Your Lender Reputation</CardTitle>
              </div>
              <div className="flex items-center space-x-2">
                <Award className="h-6 w-6 text-yellow-500" />
                <span className="text-3xl font-bold text-primary">
                  {lenderReputation.reputation_score}
                </span>
                <span className="text-gray-500">/100</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {lenderReputation.successful_disbursement_rate?.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-600">Success Rate</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{lenderReputation.total_loans_disbursed}</p>
                <p className="text-xs text-gray-600">Loans Disbursed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {lenderReputation.total_disbursements_confirmed}
                </p>
                <p className="text-xs text-gray-600">Confirmed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">
                  {lenderReputation.total_disbursements_disputed}
                </p>
                <p className="text-xs text-gray-600">Disputed</p>
              </div>
            </div>
            {lenderReputation.is_suspended && (
              <Alert className="mt-4 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Account Suspended</AlertTitle>
                <AlertDescription className="text-red-700">
                  {lenderReputation.suspension_reason}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loanRequests.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">My Offers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myOffers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Accepted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {myOffers.filter(o => o.status === 'accepted').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{messageThreads.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Browse Loan Requests</CardTitle>
          <CardDescription>Find borrowers seeking loans and make offers</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="requests" className="space-y-4">
            <TabsList>
              <TabsTrigger value="requests">
                <Search className="mr-2 h-4 w-4" />
                Loan Requests
              </TabsTrigger>
              <TabsTrigger value="my-offers">
                <Send className="mr-2 h-4 w-4" />
                My Offers
              </TabsTrigger>
              <TabsTrigger value="saved-searches">
                <Save className="mr-2 h-4 w-4" />
                Saved Searches ({savedSearches.length})
              </TabsTrigger>
              <TabsTrigger value="messages">
                <MessageSquare className="mr-2 h-4 w-4" />
                Messages ({messageThreads.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="space-y-4">
              {/* Filters */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveSearch(true)}
                  >
                    <Save className="mr-2 h-3 w-3" />
                    Save Search
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum Credit Score: {filters.minScore}</Label>
                    <Slider
                      value={[filters.minScore]}
                      onValueChange={(value) => setFilters({...filters, minScore: value[0]})}
                      min={300}
                      max={850}
                      step={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum Amount: {formatCurrency(filters.maxAmount)}</Label>
                    <Slider
                      value={[filters.maxAmount]}
                      onValueChange={(value) => setFilters({...filters, maxAmount: value[0]})}
                      min={1000}
                      max={500000}
                      step={1000}
                    />
                  </div>
                </div>
              </div>

              {/* Save Search Dialog */}
              <Dialog open={showSaveSearch} onOpenChange={setShowSaveSearch}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Search Criteria</DialogTitle>
                    <DialogDescription>
                      Get notified when new loan requests match your criteria
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="search-name">Search Name</Label>
                      <Input
                        id="search-name"
                        placeholder="e.g., High-value low-risk loans"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                      />
                    </div>
                    <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
                      <p className="text-sm font-medium">Current Filters:</p>
                      <p className="text-sm text-gray-600">Min Credit Score: {filters.minScore}</p>
                      <p className="text-sm text-gray-600">Max Amount: {formatCurrency(filters.maxAmount)}</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowSaveSearch(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveCurrentSearch} disabled={!searchName}>
                      <Bell className="mr-2 h-4 w-4" />
                      Save & Notify Me
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Requests Grid */}
              {loanRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No active loan requests available
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {loanRequests
                    .filter(req => {
                      const score = req.borrowers?.borrower_scores?.[0]?.score || 0
                      const verificationStatus = req.borrowers?.borrower_self_verification_status?.[0]?.verification_status
                      // Only show verified borrowers
                      return score >= filters.minScore &&
                             req.amount <= filters.maxAmount &&
                             verificationStatus === 'approved'
                    })
                    .map((request) => {
                      const score = request.borrowers?.borrower_scores?.[0]?.score || 500
                      const hasMyOffer = request.loan_offers?.some((o: any) => o.status === 'pending')
                      const borrower = request.borrowers
                      const verificationStatus = borrower?.borrower_self_verification_status?.[0]

                      // Calculate verification badges
                      const badges = {
                        identity: verificationStatus?.verification_status === 'approved',
                        address: !!borrower?.street_address,
                        employment: !!borrower?.employment_status,
                        bank: !!borrower?.bank_name,
                        contacts: !!(borrower?.emergency_contact_name && borrower?.next_of_kin_name),
                        social: borrower?.has_social_media || false,
                      }
                      const verifiedCount = Object.values(badges).filter(Boolean).length

                      return (
                        <Card key={request.id} className="hover:shadow-lg transition-shadow">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg">
                                  {formatCurrency(request.amount_minor)}
                                </CardTitle>
                                <CardDescription>
                                  {request.purpose}
                                </CardDescription>
                              </div>
                              <Badge className={getRiskLevel(score).color}>
                                {score}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Borrower:</span>
                                <span className="font-medium">{borrower?.full_name}</span>
                              </div>
                              {borrower?.city && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-600">Location:</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {borrower.city}
                                  </span>
                                </div>
                              )}
                              {borrower?.employment_status && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-600">Employment:</span>
                                  <span className="capitalize">{borrower.employment_status.replace('_', ' ')}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Term:</span>
                                <span>{request.term_months} months</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Offers:</span>
                                <span>{request.loan_offers?.length || 0}</span>
                              </div>
                            </div>

                            {/* Verification Badges Summary */}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">Verification:</span>
                              <Badge variant={verifiedCount >= 5 ? 'default' : verifiedCount >= 3 ? 'secondary' : 'outline'}>
                                {verifiedCount}/6 verified
                              </Badge>
                            </div>

                            {hasMyOffer ? (
                              <Button variant="outline" className="w-full" disabled>
                                <Clock className="mr-2 h-4 w-4" />
                                Offer Submitted
                              </Button>
                            ) : (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button 
                                    className="w-full"
                                    onClick={() => {
                                      setSelectedRequest(request)
                                      setOfferAmount(request.amount.toString())
                                      setOfferTerms(request.term_months.toString())
                                    }}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    Make Offer
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Make Loan Offer</DialogTitle>
                                    <DialogDescription>
                                      Review borrower details and submit your offer
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    {/* Basic Info */}
                                    <div className="border rounded-lg p-3 bg-gray-50">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="font-medium text-lg">{borrower?.full_name}</p>
                                          <p className="text-sm text-gray-600">Credit Score: {score}</p>
                                        </div>
                                        <Badge variant={verifiedCount >= 5 ? 'default' : 'secondary'}>
                                          {verifiedCount}/6 verified
                                        </Badge>
                                      </div>
                                    </div>

                                    {/* Full Verification Details */}
                                    <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/30">
                                      <h4 className="font-semibold text-sm text-blue-900 mb-3 flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Full Verification Details
                                      </h4>
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        {/* Left Column */}
                                        <div className="space-y-3">
                                          <div>
                                            <p className="text-gray-500 text-xs">Phone</p>
                                            <p className="font-medium">{borrower?.phone_e164 || 'N/A'}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs">Address</p>
                                            <p className="font-medium">{borrower?.street_address || 'N/A'}</p>
                                            <p className="text-xs">{borrower?.city}{borrower?.postal_code ? `, ${borrower.postal_code}` : ''}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs">Employment</p>
                                            <p className="font-medium capitalize">{borrower?.employment_status?.replace('_', ' ') || 'N/A'}</p>
                                            {borrower?.employer_name && <p className="text-xs">{borrower.employer_name}</p>}
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs">Income Range</p>
                                            <p className="font-medium">{borrower?.monthly_income_range || 'N/A'}</p>
                                          </div>
                                        </div>
                                        {/* Right Column */}
                                        <div className="space-y-3">
                                          <div>
                                            <p className="text-gray-500 text-xs">Bank Account</p>
                                            <p className="font-medium">{borrower?.bank_name || 'N/A'}</p>
                                            <p className="text-xs font-mono">{borrower?.bank_account_number || 'N/A'}</p>
                                            <p className="text-xs">{borrower?.bank_account_name || 'N/A'}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs">Emergency Contact</p>
                                            <p className="font-medium">{borrower?.emergency_contact_name || 'N/A'}</p>
                                            <p className="text-xs">{borrower?.emergency_contact_phone || 'N/A'}</p>
                                          </div>
                                          <div>
                                            <p className="text-gray-500 text-xs">Next of Kin</p>
                                            <p className="font-medium">{borrower?.next_of_kin_name || 'N/A'}</p>
                                            <p className="text-xs">{borrower?.next_of_kin_phone || 'N/A'}</p>
                                          </div>
                                          {(borrower?.linkedin_url || borrower?.facebook_url) && (
                                            <div>
                                              <p className="text-gray-500 text-xs">Social Media</p>
                                              <div className="flex gap-2">
                                                {borrower?.linkedin_url && (
                                                  <a href={borrower.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                     className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                                    LinkedIn <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                )}
                                                {borrower?.facebook_url && (
                                                  <a href={borrower.facebook_url} target="_blank" rel="noopener noreferrer"
                                                     className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                                    Facebook <ExternalLink className="h-3 w-3" />
                                                  </a>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <Alert className="mt-3 bg-yellow-50 border-yellow-200">
                                        <AlertCircle className="h-3 w-3 text-yellow-600" />
                                        <AlertDescription className="text-xs text-yellow-800">
                                          Verify this info matches what the borrower tells you in person before disbursing.
                                        </AlertDescription>
                                      </Alert>
                                    </div>

                                    {/* Offer Form */}
                                    <div className="grid grid-cols-3 gap-3">
                                      <div className="space-y-2">
                                        <Label htmlFor="offer-amount">Amount</Label>
                                        <Input
                                          id="offer-amount"
                                          type="number"
                                          value={offerAmount}
                                          onChange={(e) => setOfferAmount(e.target.value)}
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <Label htmlFor="offer-rate">Rate (%)</Label>
                                        <Input
                                          id="offer-rate"
                                          type="number"
                                          step="0.1"
                                          value={offerRate}
                                          onChange={(e) => setOfferRate(e.target.value)}
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <Label htmlFor="offer-terms">Months</Label>
                                        <Input
                                          id="offer-terms"
                                          type="number"
                                          value={offerTerms}
                                          onChange={(e) => setOfferTerms(e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button
                                      variant="outline"
                                      onClick={() => setSelectedRequest(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={submitOffer}
                                      disabled={submittingOffer}
                                    >
                                      {submittingOffer ? 'Submitting...' : 'Submit Offer'}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-offers" className="space-y-4">
              {myOffers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  You haven't made any offers yet
                </div>
              ) : (
                <div className="space-y-4">
                  {myOffers.map((offer) => (
                    <Card key={offer.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">
                              {offer.loan_requests?.borrowers?.full_name}
                            </CardTitle>
                            <CardDescription>
                              {offer.loan_requests?.purpose}
                            </CardDescription>
                          </div>
                          <Badge 
                            className={
                              offer.status === 'accepted' 
                                ? 'bg-green-100 text-green-800'
                                : offer.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {offer.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Offered Amount</p>
                            <p className="font-medium">{formatCurrency(offer.amount_minor)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Interest Rate</p>
                            <p className="font-medium">{offer.interest_rate}%</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Term</p>
                            <p className="font-medium">{offer.term_months} months</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Submitted</p>
                            <p className="font-medium">
                              {format(new Date(offer.created_at), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="saved-searches" className="space-y-4">
              {savedSearches.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Save className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No saved searches yet</p>
                  <p className="text-sm mt-2">Save your filter criteria to get notified of matching requests</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedSearches.map((search) => (
                    <Card key={search.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <Bell className={search.notify_on_match ? "h-4 w-4 text-green-500" : "h-4 w-4 text-gray-400"} />
                            <CardTitle className="text-lg">{search.search_name}</CardTitle>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSavedSearch(search.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2 text-sm">
                          {search.min_credit_score && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Min Credit Score:</span>
                              <span className="font-medium">{search.min_credit_score}</span>
                            </div>
                          )}
                          {search.max_amount_minor && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Max Amount:</span>
                              <span className="font-medium">{formatCurrency(search.max_amount_minor / 100)}</span>
                            </div>
                          )}
                          {search.max_term_months && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Max Term:</span>
                              <span className="font-medium">{search.max_term_months} months</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => applySavedSearch(search)}
                        >
                          <Search className="mr-2 h-4 w-4" />
                          Apply Filters
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="messages" className="space-y-4">
              {messageThreads.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active message threads</p>
                  <p className="text-sm mt-2">Start messaging borrowers after making an offer</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messageThreads.map((thread) => (
                    <Card key={thread.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center space-x-2">
                              <User className="h-4 w-4" />
                              <span>{thread.borrowers?.full_name}</span>
                            </CardTitle>
                            <CardDescription>
                              {thread.loan_requests?.purpose}
                            </CardDescription>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800">
                            {thread.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            Last message: {format(new Date(thread.last_message_at), 'MMM dd, yyyy HH:mm')}
                          </span>
                          <Button variant="outline" size="sm">
                            <MessageSquare className="mr-2 h-3 w-3" />
                            View Thread
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}