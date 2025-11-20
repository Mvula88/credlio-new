'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrencyByCountry, formatCurrency, AFRICAN_CURRENCIES } from '@/lib/utils/currency'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle } from 'lucide-react'

export default function CurrencyTestPage() {
  const [userCountry, setUserCountry] = useState<string | null>(null)
  const [userCurrency, setUserCurrency] = useState<any>(null)
  const [dbCurrencies, setDbCurrencies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // Get current user's country
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('country_code')
          .eq('user_id', user.id)
          .single()

        if (profile?.country_code) {
          setUserCountry(profile.country_code)

          // Get currency from database
          const { data: currencyData } = await supabase
            .from('country_currency_allowed')
            .select('*')
            .eq('country_code', profile.country_code)
            .single()

          setUserCurrency(currencyData)
        }
      }

      // Get all currencies from database
      const { data: allCurrencies } = await supabase
        .from('country_currency_allowed')
        .select(`
          *,
          countries(name)
        `)
        .order('country_code')

      setDbCurrencies(allCurrencies || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const testAmount = 150000 // 1,500.00 in most currencies (or 1500 for zero-decimal currencies)

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Currency System Test</h1>
        <p className="text-gray-600 mt-1">Verify multi-currency support across all countries</p>
      </div>

      {/* Your Current Currency */}
      {userCountry && userCurrency && (
        <Card className="border-2 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Your Account Currency</span>
            </CardTitle>
            <CardDescription>Based on your registered country</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Country Code</p>
                <p className="text-xl font-bold">{userCountry}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Currency</p>
                <p className="text-xl font-bold">{userCurrency.currency_code}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Symbol</p>
                <p className="text-xl font-bold">{userCurrency.currency_symbol}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Decimals</p>
                <p className="text-xl font-bold">{userCurrency.minor_units}</p>
              </div>
            </div>
            <div className="mt-4 p-4 bg-white rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Example amount formatting:</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(testAmount, {
                  code: userCurrency.currency_code,
                  symbol: userCurrency.currency_symbol,
                  minorUnits: userCurrency.minor_units,
                  countryCode: userCountry
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Supported Currencies */}
      <Card>
        <CardHeader>
          <CardTitle>All Supported Currencies ({dbCurrencies.length})</CardTitle>
          <CardDescription>
            Each country has its own currency configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dbCurrencies.map((currency) => (
              <div
                key={currency.country_code}
                className={`border rounded-lg p-4 ${
                  currency.country_code === userCountry
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">
                    {currency.countries?.name || currency.country_code}
                  </h3>
                  {currency.country_code === userCountry && (
                    <Badge className="bg-green-600">Your Country</Badge>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Code:</span>
                    <span className="font-medium">{currency.country_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Currency:</span>
                    <span className="font-medium">{currency.currency_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Symbol:</span>
                    <span className="font-medium text-lg">{currency.currency_symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Decimals:</span>
                    <span className="font-medium">{currency.minor_units}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-gray-600 text-xs mb-1">Amount Display:</p>
                    <p className="font-bold text-blue-600">
                      {formatCurrency(testAmount, {
                        code: currency.currency_code,
                        symbol: currency.currency_symbol,
                        minorUnits: currency.minor_units,
                        countryCode: currency.country_code
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hardcoded Currency Library Test */}
      <Card>
        <CardHeader>
          <CardTitle>Currency Library Test</CardTitle>
          <CardDescription>
            Testing currencies from hardcoded library (lib/utils/currency.ts)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(AFRICAN_CURRENCIES).map((currency) => {
              const dbMatch = dbCurrencies.find(
                db => db.currency_code === currency.code
              )
              const matches = dbMatch &&
                dbMatch.currency_symbol === currency.symbol &&
                dbMatch.minor_units === currency.minorUnits

              return (
                <div
                  key={currency.code}
                  className={`border rounded-lg p-4 ${
                    matches ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{currency.code}</h3>
                    {matches ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Symbol:</span>
                      <span className="font-medium">{currency.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Decimals:</span>
                      <span className="font-medium">{currency.minorUnits}</span>
                    </div>
                    <div className="mt-2">
                      <p className="font-bold text-blue-600">
                        {formatCurrency(testAmount, currency)}
                      </p>
                    </div>
                    {!dbMatch && (
                      <p className="text-xs text-red-600 mt-2">
                        Not found in database
                      </p>
                    )}
                    {dbMatch && !matches && (
                      <p className="text-xs text-red-600 mt-2">
                        Mismatch with database
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Verification Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              {dbCurrencies.length === 12 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span>
                All 12 countries have currencies configured ({dbCurrencies.length}/12)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {userCurrency ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span>Your account has currency assigned</span>
            </div>
            <div className="flex items-center space-x-2">
              {Object.keys(AFRICAN_CURRENCIES).length === 12 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span>
                Currency library has all 12 currencies ({Object.keys(AFRICAN_CURRENCIES).length}/12)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
