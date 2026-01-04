'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatMinorToMajor } from '@/lib/utils/currency'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Globe,
  MapPin,
  Users,
  Building2,
  FileText,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  UserCheck,
  Rocket,
  Crown,
  Clock,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  XCircle,
  Ban
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'

export default function CountriesPage() {
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [processingCountry, setProcessingCountry] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadCountries()
  }, [])

  const loadCountries = async () => {
    try {
      // Get all countries with launch status (using * to handle schema differences)
      const { data: countriesData, error: countriesError } = await supabase
        .from('countries')
        .select('*')
        .order('name')

      if (countriesError) {
        console.error('Error loading countries:', countriesError)
        return
      }

      if (!countriesData || countriesData.length === 0) {
        console.log('No countries found in database')
        return
      }

      // Get statistics for each country
      const countryStats = await Promise.all(
        countriesData.map(async (country: any) => {
          // Get users by country
          const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('country_code', country.code)

          // Get borrowers by country with their account links
          const { data: borrowersData } = await supabase
            .from('borrowers')
            .select('id, borrower_user_links(user_id)')
            .eq('country_code', country.code)

          const totalBorrowers = borrowersData?.length || 0
          // Count borrowers without linked accounts (no entry in borrower_user_links)
          const unregisteredBorrowers = borrowersData?.filter(
            (b: any) => !b.borrower_user_links || b.borrower_user_links.length === 0
          ).length || 0

          // Get lenders by country
          const { count: totalLenders } = await supabase
            .from('lenders')
            .select('*', { count: 'exact', head: true })
            .eq('country', country.code)

          // Get loans by country
          const { data: loans } = await supabase
            .from('loans')
            .select('principal_minor, status')
            .eq('country_code', country.code)

          const totalLoans = loans?.length || 0
          const activeLoans = loans?.filter((l: any) => l.status === 'active').length || 0
          // Keep in MINOR units for consistent formatting
          const totalLoanVolume = loans?.reduce((sum: number, loan: any) => sum + (loan.principal_minor || 0), 0) || 0

          // Get risk flags by country
          const { count: openRiskFlags } = await supabase
            .from('risk_flags')
            .select('*', { count: 'exact', head: true })
            .eq('country_code', country.code)
            .is('resolved_at', null)

          // Get currency info
          const { data: currencyData } = await supabase
            .from('country_currency_allowed')
            .select('currency_code, currency_symbol')
            .eq('country_code', country.code)
            .eq('is_default', true)
            .single()

          // Get subscription counts for lenders in this country
          // First get all lender user_ids for this country
          const { data: lenderUsers } = await supabase
            .from('lenders')
            .select('user_id')
            .eq('country', country.code)

          let proSubscribers = 0
          let proPlusSubscribers = 0
          let freemiumUsers = 0

          if (lenderUsers && lenderUsers.length > 0) {
            const userIds = lenderUsers.map((l: any) => l.user_id)

            // Get active subscriptions for these users
            const { data: subscriptions } = await supabase
              .from('subscriptions')
              .select('user_id, tier')
              .in('user_id', userIds)
              .eq('status', 'active')

            proSubscribers = subscriptions?.filter((s: any) => s.tier === 'pro').length || 0
            proPlusSubscribers = subscriptions?.filter((s: any) => s.tier === 'pro_plus').length || 0
            freemiumUsers = (totalLenders || 0) - proSubscribers - proPlusSubscribers
          }

          // Calculate launch period status
          const launchEndsAt = country.launch_period_ends_at ? new Date(country.launch_period_ends_at) : null
          // Use !! to handle undefined/null properly - only true if column exists AND has a value
          const isPaused = !!country.launch_paused_at
          const isEndedPermanently = country.launch_ended_permanently === true
          const isInLaunchPeriod = !isPaused && !isEndedPermanently && launchEndsAt && launchEndsAt > new Date()

          // Calculate days remaining
          let launchDaysRemaining = 0
          if (isPaused) {
            launchDaysRemaining = country.launch_days_remaining_when_paused || 0
          } else if (isInLaunchPeriod && launchEndsAt) {
            launchDaysRemaining = Math.max(0, differenceInDays(launchEndsAt, new Date()))
          }

          // Determine launch status
          let launchStatus: 'not_launched' | 'active' | 'paused' | 'expired' | 'ended_permanently' = 'not_launched'
          if (isEndedPermanently) {
            launchStatus = 'ended_permanently'
          } else if (isPaused) {
            launchStatus = 'paused'
          } else if (isInLaunchPeriod) {
            launchStatus = 'active'
          } else if (country.is_launched) {
            launchStatus = 'expired'
          }

          return {
            code: country.code,
            name: country.name,
            phonePrefix: country.phone_prefix,
            currency: currencyData?.currency_code || 'USD',
            currencySymbol: currencyData?.currency_symbol || '$',
            totalUsers: totalUsers || 0,
            totalBorrowers: totalBorrowers || 0,
            unregisteredBorrowers: unregisteredBorrowers || 0,
            totalLenders: totalLenders || 0,
            totalLoans,
            activeLoans,
            totalLoanVolume,
            openRiskFlags: openRiskFlags || 0,
            isActive: (totalUsers || 0) > 0,
            // Launch info
            isLaunched: country.is_launched || false,
            launchPeriodEndsAt: country.launch_period_ends_at,
            isInLaunchPeriod,
            launchDaysRemaining,
            launchStatus,
            isPaused,
            isEndedPermanently,
            launchCount: country.launch_count || 0,
            // Subscription info
            proSubscribers,
            proPlusSubscribers,
            freemiumUsers: freemiumUsers > 0 ? freemiumUsers : (totalLenders || 0)
          }
        })
      )

      setCountries(countryStats)
    } catch (error) {
      console.error('Error loading countries:', error)
    } finally {
      setLoading(false)
    }
  }

  // Launch control functions
  const handleLaunchAction = async (countryCode: string, action: 'launch' | 'pause' | 'resume' | 'relaunch' | 'end') => {
    try {
      setProcessingCountry(countryCode)

      let rpcName = ''
      let successMessage = ''

      switch (action) {
        case 'launch':
          rpcName = 'admin_launch_country'
          successMessage = 'Country launched! All lenders get free BUSINESS access for 14 days.'
          break
        case 'pause':
          rpcName = 'admin_pause_launch'
          successMessage = 'Launch paused. Days remaining have been frozen.'
          break
        case 'resume':
          rpcName = 'admin_resume_launch'
          successMessage = 'Launch resumed! Countdown continues.'
          break
        case 'relaunch':
          rpcName = 'admin_relaunch_country'
          successMessage = 'Country relaunched! 14-day countdown restarted.'
          break
        case 'end':
          rpcName = 'admin_end_launch_permanently'
          successMessage = 'Launch period ended permanently. No more free access.'
          break
      }

      const { data, error } = await supabase.rpc(rpcName, {
        p_country_code: countryCode
      })

      if (error) {
        console.error(`Error ${action}ing country:`, error)
        toast.error(`Failed: ${error.message}`)
        return
      }

      toast.success(successMessage)
      await loadCountries()
    } catch (error: any) {
      console.error(`Error ${action}ing country:`, error)
      toast.error(`Failed to ${action} country`)
    } finally {
      setProcessingCountry(null)
    }
  }

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Use centralized currency utility - always converts from minor units
  const formatCurrency = (amountMinor: number, symbol: string = '$') => {
    return formatMinorToMajor(amountMinor, symbol)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading countries...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg flex items-center">
              <Globe className="h-10 w-10 mr-3" />
              Country Administration
            </h1>
            <p className="text-white/90 text-lg font-medium drop-shadow">
              Manage platform operations across 12 African countries • {format(new Date(), 'MMMM dd, yyyy')}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Countries</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-blue-600">{countries.length}</span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              {countries.filter(c => c.isActive).length} active
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Launched</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-xl">
              <Rocket className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-orange-600">
              {countries.filter(c => c.isLaunched).length}
            </span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              {countries.filter(c => c.isInLaunchPeriod).length} in launch period
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pro Subscribers</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
              <Crown className="h-5 w-5 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-amber-600">
              {countries.reduce((sum, c) => sum + c.proSubscribers + c.proPlusSubscribers, 0)}
            </span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              {countries.reduce((sum, c) => sum + c.freemiumUsers, 0)} freemium
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Risk Flags</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-600">
              {countries.reduce((sum, c) => sum + c.openRiskFlags, 0)}
            </span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              Open alerts
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="tech-card border-none">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search countries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Countries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCountries.map((country) => (
          <Card
            key={country.code}
            className="tech-card hover-lift border-none cursor-pointer transition-all duration-300 hover:scale-105"
            onClick={() => router.push(`/admin/countries/${country.code}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <CardTitle className="text-2xl">{country.name}</CardTitle>
                    {country.launchStatus === 'active' && (
                      <Badge className="bg-orange-500 text-white">
                        <Rocket className="h-3 w-3 mr-1" />
                        Launching ({country.launchDaysRemaining}d)
                      </Badge>
                    )}
                    {country.launchStatus === 'paused' && (
                      <Badge className="bg-yellow-500 text-white">
                        <Pause className="h-3 w-3 mr-1" />
                        Paused ({country.launchDaysRemaining}d left)
                      </Badge>
                    )}
                    {country.launchStatus === 'expired' && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        <Clock className="h-3 w-3 mr-1" />
                        Launch Expired
                      </Badge>
                    )}
                    {country.launchStatus === 'ended_permanently' && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Live
                      </Badge>
                    )}
                    {country.launchStatus === 'not_launched' && (
                      <Badge variant="outline" className="text-gray-500">
                        Not Launched
                      </Badge>
                    )}
                    {country.launchCount > 1 && (
                      <Badge variant="outline" className="text-xs">
                        #{country.launchCount}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center space-x-2">
                    <Badge variant="outline">{country.code}</Badge>
                    <span className="text-xs">•</span>
                    <span className="text-xs">{country.phonePrefix}</span>
                    <span className="text-xs">•</span>
                    <span className="text-xs font-semibold">{country.currency}</span>
                  </CardDescription>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-xs text-blue-600 font-medium">Accounts</span>
                  </div>
                  <div className="text-xl font-bold text-blue-700">{country.totalUsers}</div>
                  <div className="text-xs text-blue-500 mt-0.5">Lenders + Borrowers</div>
                </div>

                <div className="p-3 bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Borrowers</span>
                  </div>
                  <div className="text-xl font-bold text-green-700">{country.totalBorrowers}</div>
                  {country.unregisteredBorrowers > 0 && (
                    <div className="text-xs text-orange-600 mt-0.5">{country.unregisteredBorrowers} no account</div>
                  )}
                </div>

                <div className="p-3 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <Building2 className="h-4 w-4 text-purple-600" />
                    <span className="text-xs text-purple-600 font-medium">Lenders</span>
                  </div>
                  <div className="text-xl font-bold text-purple-700">{country.totalLenders}</div>
                </div>

                <div className="p-3 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <FileText className="h-4 w-4 text-amber-600" />
                    <span className="text-xs text-amber-600 font-medium">Loans</span>
                  </div>
                  <div className="text-xl font-bold text-amber-700">{country.totalLoans}</div>
                  {country.activeLoans > 0 && (
                    <div className="text-xs text-amber-600 mt-0.5">{country.activeLoans} active</div>
                  )}
                </div>
              </div>

              {/* Loan Volume */}
              <div className="p-3 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-4 w-4 text-slate-600" />
                    <span className="text-xs text-slate-600 font-medium">Loan Volume</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {formatCurrency(country.totalLoanVolume, country.currencySymbol)}
                  </div>
                </div>
              </div>

              {/* Launch Period Info */}
              {(country.launchStatus === 'active' || country.launchStatus === 'paused') && (
                <div className={`p-3 border rounded-lg ${
                  country.launchStatus === 'paused'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-orange-50 border-orange-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {country.launchStatus === 'paused' ? (
                        <Pause className="h-4 w-4 text-yellow-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-orange-600" />
                      )}
                      <span className={`text-xs font-medium ${
                        country.launchStatus === 'paused' ? 'text-yellow-600' : 'text-orange-600'
                      }`}>
                        {country.launchStatus === 'paused' ? 'Paused - Days Frozen' : 'Free BUSINESS Access'}
                      </span>
                    </div>
                    <div className={`text-lg font-bold ${
                      country.launchStatus === 'paused' ? 'text-yellow-600' : 'text-orange-600'
                    }`}>
                      {country.launchDaysRemaining} days {country.launchStatus === 'paused' ? 'frozen' : 'left'}
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription Breakdown */}
              {country.totalLenders > 0 && (
                <div className="p-3 bg-gradient-to-r from-amber-50 to-purple-50 rounded-lg border border-amber-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Crown className="h-4 w-4 text-amber-600" />
                    <span className="text-xs text-amber-700 font-medium">Subscription Status</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-purple-600">{country.proPlusSubscribers}</div>
                      <div className="text-xs text-gray-500">Pro Plus</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-600">{country.proSubscribers}</div>
                      <div className="text-xs text-gray-500">Pro</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-600">{country.freemiumUsers}</div>
                      <div className="text-xs text-gray-500">Free</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Risk Flags Warning */}
              {country.openRiskFlags > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">Risk Flags</span>
                    </div>
                    <div className="text-lg font-bold text-red-600">{country.openRiskFlags}</div>
                  </div>
                </div>
              )}

              {/* Launch Controls */}
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {/* Not launched - show Launch button */}
                  {country.launchStatus === 'not_launched' && (
                    <Button
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Launch ${country.name}?\n\nThis will give all lenders FREE BUSINESS access for 14 days.`)) {
                          handleLaunchAction(country.code, 'launch')
                        }
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Rocket className="mr-1 h-4 w-4" />
                          Launch
                        </>
                      )}
                    </Button>
                  )}

                  {/* Active launch - show Pause button */}
                  {country.launchStatus === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLaunchAction(country.code, 'pause')
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Pause className="mr-1 h-4 w-4" />
                          Pause
                        </>
                      )}
                    </Button>
                  )}

                  {/* Paused - show Resume button */}
                  {country.launchStatus === 'paused' && (
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 text-white hover:bg-green-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLaunchAction(country.code, 'resume')
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="mr-1 h-4 w-4" />
                          Resume
                        </>
                      )}
                    </Button>
                  )}

                  {/* Active or Paused - show Relaunch button */}
                  {(country.launchStatus === 'active' || country.launchStatus === 'paused') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-500 text-blue-600 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Relaunch ${country.name}?\n\nThis will restart the 14-day countdown from day 1.`)) {
                          handleLaunchAction(country.code, 'relaunch')
                        }
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Relaunch
                        </>
                      )}
                    </Button>
                  )}

                  {/* Expired - show Relaunch button */}
                  {country.launchStatus === 'expired' && (
                    <Button
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Relaunch ${country.name}?\n\nThis will give all lenders FREE BUSINESS access for another 14 days.`)) {
                          handleLaunchAction(country.code, 'relaunch')
                        }
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Relaunch
                        </>
                      )}
                    </Button>
                  )}

                  {/* Active, Paused, or Expired - show End Permanently button */}
                  {(country.launchStatus === 'active' || country.launchStatus === 'paused' || country.launchStatus === 'expired') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500 text-red-600 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`End launch permanently for ${country.name}?\n\n⚠️ This will:\n• Remove all free BUSINESS access\n• Cannot be undone\n• Lenders must subscribe to get premium features\n\nOnly do this when launch is successful!`)) {
                          handleLaunchAction(country.code, 'end')
                        }
                      }}
                      disabled={processingCountry === country.code}
                    >
                      {processingCountry === country.code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Ban className="mr-1 h-4 w-4" />
                          End Launch
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* View Admin Button */}
                <Button
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/admin/countries/${country.code}`)
                  }}
                >
                  View Admin
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredCountries.length === 0 && (
        <Card className="tech-card border-none">
          <CardContent className="py-12">
            <div className="text-center">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No countries found matching your search</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
