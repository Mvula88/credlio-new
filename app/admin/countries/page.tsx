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
  UserCheck
} from 'lucide-react'
import { format } from 'date-fns'

export default function CountriesPage() {
  const [loading, setLoading] = useState(true)
  const [countries, setCountries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadCountries()
  }, [])

  const loadCountries = async () => {
    try {
      // Get all countries
      const { data: countriesData } = await supabase
        .from('countries')
        .select('code, name, phone_prefix')
        .order('name')

      if (!countriesData) return

      // Get statistics for each country
      const countryStats = await Promise.all(
        countriesData.map(async (country) => {
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
            .eq('country_code', country.code)

          // Get loans by country
          const { data: loans } = await supabase
            .from('loans')
            .select('principal_minor, status')
            .eq('country_code', country.code)

          const totalLoans = loans?.length || 0
          const activeLoans = loans?.filter(l => l.status === 'active').length || 0
          // Keep in MINOR units for consistent formatting
          const totalLoanVolume = loans?.reduce((sum, loan) => sum + (loan.principal_minor || 0), 0) || 0

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
            isActive: (totalUsers || 0) > 0
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
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Users</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <Users className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-green-600">
              {countries.reduce((sum, c) => sum + c.totalUsers, 0)}
            </span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              Across all countries
            </div>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Loans</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-purple-600">
              {countries.reduce((sum, c) => sum + c.totalLoans, 0)}
            </span>
            <div className="mt-1.5 text-sm text-muted-foreground font-medium">
              {countries.reduce((sum, c) => sum + c.activeLoans, 0)} active
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
                    {country.isActive && (
                      <div className="p-1 bg-green-100 rounded-full">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
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

              <Button
                className="w-full bg-gradient-to-r from-primary to-secondary text-white"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/admin/countries/${country.code}`)
                }}
              >
                View Country Admin
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
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
