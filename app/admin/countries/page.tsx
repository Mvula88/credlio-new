'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
  Loader2
} from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'

export default function CountriesPage() {
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [launchingCountry, setLaunchingCountry] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadCountries()
  }, [])

  const loadCountries = async () => {
    try {
      // Get all countries with launch status
      const { data: countriesData } = await supabase
        .from('countries')
        .select('code, name, phone_prefix, is_launched, launch_period_ends_at')
        .order('name')

      if (!countriesData) return

      // Get statistics for each country
      const countryStats = await Promise.all(
        countriesData.map(async (country: any) => {
          // Get users by country
          const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('country_code', country.code)

          // Get borrowers by country
          const { count: totalBorrowers } = await supabase
            .from('borrowers')
            .select('*', { count: 'exact', head: true })
            .eq('country_code', country.code)

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
          const isInLaunchPeriod = launchEndsAt && launchEndsAt > new Date()
          const launchDaysRemaining = launchEndsAt && isInLaunchPeriod
            ? differenceInDays(launchEndsAt, new Date())
            : 0

          return {
            code: country.code,
            name: country.name,
            phonePrefix: country.phone_prefix,
            currency: currencyData?.currency_code || 'USD',
            currencySymbol: currencyData?.currency_symbol || '$',
            totalUsers: totalUsers || 0,
            totalBorrowers: totalBorrowers || 0,
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

  // Launch a country with 14 days free Pro access
  const launchCountry = async (countryCode: string) => {
    try {
      setLaunchingCountry(countryCode)

      // Call the database function to set launch period
      const { data, error } = await supabase.rpc('set_country_launch_period', {
        p_country_code: countryCode,
        p_days: 14
      })

      if (error) {
        console.error('Error launching country:', error)
        alert(`Failed to launch country: ${error.message}`)
        return
      }

      // Reload countries to get updated launch status
      await loadCountries()
      alert(`Country launched successfully! All lenders get free Pro access for 14 days.`)
    } catch (error) {
      console.error('Error launching country:', error)
      alert('Failed to launch country. Please try again.')
    } finally {
      setLaunchingCountry(null)
    }
  }

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatCurrency = (amount: number, symbol: string = '$') => {
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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
                    {country.isInLaunchPeriod ? (
                      <Badge className="bg-orange-500 text-white">
                        <Rocket className="h-3 w-3 mr-1" />
                        Launch Period
                      </Badge>
                    ) : country.isLaunched ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Launched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">
                        Not Launched
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
                    <span className="text-xs text-blue-600 font-medium">Users</span>
                  </div>
                  <div className="text-xl font-bold text-blue-700">{country.totalUsers}</div>
                </div>

                <div className="p-3 bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Borrowers</span>
                  </div>
                  <div className="text-xl font-bold text-green-700">{country.totalBorrowers}</div>
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
              {country.isInLaunchPeriod && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <span className="text-xs text-orange-600 font-medium">Free Pro Access</span>
                    </div>
                    <div className="text-lg font-bold text-orange-600">{country.launchDaysRemaining} days left</div>
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

              {/* Launch Button or View Button */}
              <div className="flex gap-2">
                {!country.isLaunched && (
                  <Button
                    className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Launch ${country.name}? This will give all lenders in this country FREE Pro access for 14 days.`)) {
                        launchCountry(country.code)
                      }
                    }}
                    disabled={launchingCountry === country.code}
                  >
                    {launchingCountry === country.code ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Launching...
                      </>
                    ) : (
                      <>
                        <Rocket className="mr-2 h-4 w-4" />
                        Launch Country
                      </>
                    )}
                  </Button>
                )}
                <Button
                  className={`${country.isLaunched ? 'w-full' : 'flex-1'} bg-gradient-to-r from-primary to-secondary text-white`}
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
