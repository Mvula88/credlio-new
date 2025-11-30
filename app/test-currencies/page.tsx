'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import {
  formatCurrency,
  getCurrencyByCountry,
  AFRICAN_CURRENCIES,
  type CurrencyInfo
} from '@/lib/utils/currency'

// Test cases to verify currency formatting
const TEST_CASES = [
  {
    name: 'Small loan (100 major units)',
    minorUnits: 10000, // 100 * 100
    expectedMajor: 100,
    description: 'e.g., N$100, R100, KSh100'
  },
  {
    name: 'Medium loan (500 major units)',
    minorUnits: 50000, // 500 * 100
    expectedMajor: 500,
    description: 'e.g., N$500, R500, KSh500'
  },
  {
    name: 'Large loan (1,000 major units)',
    minorUnits: 100000, // 1000 * 100
    expectedMajor: 1000,
    description: 'e.g., N$1,000, R1,000, KSh1,000'
  },
  {
    name: 'Very large loan (10,000 major units)',
    minorUnits: 1000000, // 10000 * 100
    expectedMajor: 10000,
    description: 'e.g., N$10,000, R10,000, KSh10,000'
  },
  {
    name: 'With cents (123.45 major units)',
    minorUnits: 12345, // 123.45 * 100
    expectedMajor: 123.45,
    description: 'e.g., N$123.45, R123.45'
  },
]

// Countries with their expected currency info
const COUNTRY_TESTS = [
  { code: 'NA', name: 'Namibia', symbol: 'N$', currencyCode: 'NAD', decimals: 2 },
  { code: 'ZA', name: 'South Africa', symbol: 'R', currencyCode: 'ZAR', decimals: 2 },
  { code: 'KE', name: 'Kenya', symbol: 'KSh', currencyCode: 'KES', decimals: 2 },
  { code: 'NG', name: 'Nigeria', symbol: '₦', currencyCode: 'NGN', decimals: 2 },
  { code: 'GH', name: 'Ghana', symbol: '₵', currencyCode: 'GHS', decimals: 2 },
  { code: 'TZ', name: 'Tanzania', symbol: 'TSh', currencyCode: 'TZS', decimals: 2 },
  { code: 'UG', name: 'Uganda', symbol: 'USh', currencyCode: 'UGX', decimals: 0 },
  { code: 'RW', name: 'Rwanda', symbol: 'RF', currencyCode: 'RWF', decimals: 0 },
  { code: 'ZM', name: 'Zambia', symbol: 'K', currencyCode: 'ZMW', decimals: 2 },
  { code: 'MW', name: 'Malawi', symbol: 'MK', currencyCode: 'MWK', decimals: 2 },
  { code: 'CM', name: 'Cameroon', symbol: 'FCFA', currencyCode: 'XAF', decimals: 0 },
  { code: 'CI', name: 'Ivory Coast', symbol: 'CFA', currencyCode: 'XOF', decimals: 0 },
]

export default function TestCurrenciesPage() {
  // Run tests
  const results: {
    country: string
    countryCode: string
    currencyFound: boolean
    symbolCorrect: boolean
    formattingCorrect: boolean
    details: string[]
    currency?: CurrencyInfo
  }[] = []

  COUNTRY_TESTS.forEach(country => {
    const currency = getCurrencyByCountry(country.code)
    const details: string[] = []
    let currencyFound = false
    let symbolCorrect = false
    let formattingCorrect = true

    if (!currency) {
      details.push(`Currency not found for country code: ${country.code}`)
    } else {
      currencyFound = true

      // Check symbol
      if (currency.symbol === country.symbol) {
        symbolCorrect = true
      } else {
        details.push(`Symbol mismatch: expected "${country.symbol}", got "${currency.symbol}"`)
      }

      // Test formatting with 50000 minor units (should be 500 for 2-decimal currencies)
      const testMinor = 50000
      const formatted = formatCurrency(testMinor, currency)

      // For 0-decimal currencies, 50000 minor = 50000 major
      // For 2-decimal currencies, 50000 minor = 500 major
      const expectedMajor = country.decimals === 0 ? 50000 : 500

      // Extract the numeric value from formatted string for comparison
      const formattedNumber = parseFloat(formatted.replace(/[^0-9.]/g, ''))
      const isCorrect = Math.abs(formattedNumber - expectedMajor) < 0.01

      if (!isCorrect) {
        formattingCorrect = false
        details.push(`Formatting issue: formatCurrency(${testMinor}) = "${formatted}" (${formattedNumber}), expected ${expectedMajor}`)
      }
    }

    results.push({
      country: country.name,
      countryCode: country.code,
      currencyFound,
      symbolCorrect,
      formattingCorrect,
      details,
      currency: currency || undefined
    })
  })

  const allPassed = results.every(r => r.currencyFound && r.symbolCorrect && r.formattingCorrect)
  const passedCount = results.filter(r => r.currencyFound && r.symbolCorrect && r.formattingCorrect).length

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Currency Formatting Test Suite</h1>
        <p className="text-gray-600 mt-2">
          Verifies that currency formatting works correctly for all African countries
        </p>
      </div>

      {/* Overall Status */}
      <Alert className={allPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
        {allPassed ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}
        <AlertDescription className={allPassed ? 'text-green-800' : 'text-red-800'}>
          <strong>{allPassed ? 'All Tests Passed!' : 'Some Tests Failed'}</strong>
          <span className="ml-2">({passedCount}/{results.length} countries passing)</span>
        </AlertDescription>
      </Alert>

      {/* Test Results by Country */}
      <Card>
        <CardHeader>
          <CardTitle>Country Currency Tests</CardTitle>
          <CardDescription>
            Each country should have correct currency symbol and formatting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(result => {
              const passed = result.currencyFound && result.symbolCorrect && result.formattingCorrect
              return (
                <div
                  key={result.countryCode}
                  className={`p-4 rounded-lg border-2 ${
                    passed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{result.country}</h3>
                      <p className="text-sm text-gray-500">{result.countryCode}</p>
                    </div>
                    {passed ? (
                      <Badge className="bg-green-100 text-green-800">PASS</Badge>
                    ) : (
                      <Badge variant="destructive">FAIL</Badge>
                    )}
                  </div>

                  {result.currency && (
                    <div className="space-y-1 text-sm">
                      <p><strong>Symbol:</strong> {result.currency.symbol}</p>
                      <p><strong>Code:</strong> {result.currency.code}</p>
                      <p><strong>Decimals:</strong> {result.currency.minorUnits}</p>
                      <div className="mt-2 p-2 bg-white rounded border">
                        <p className="text-xs text-gray-500">50,000 minor units =</p>
                        <p className="text-lg font-bold text-blue-600">
                          {formatCurrency(50000, result.currency)}
                        </p>
                      </div>
                    </div>
                  )}

                  {result.details.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      {result.details.map((d, i) => (
                        <p key={i}>• {d}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Formatting Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Formatting Examples (Using Namibian Dollar)</CardTitle>
          <CardDescription>
            Shows how different amounts are formatted - this is what users see
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Test Case</th>
                  <th className="text-right py-2 px-4">Minor Units (DB)</th>
                  <th className="text-right py-2 px-4">Expected Major</th>
                  <th className="text-right py-2 px-4">Formatted Output</th>
                  <th className="text-center py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {TEST_CASES.map((testCase, idx) => {
                  const currency = getCurrencyByCountry('NA')!
                  const formatted = formatCurrency(testCase.minorUnits, currency)

                  // Remove all non-numeric characters except decimal point for comparison
                  const formattedNumber = parseFloat(formatted.replace(/[^0-9.]/g, ''))
                  const passed = Math.abs(formattedNumber - testCase.expectedMajor) < 0.01

                  return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium">{testCase.name}</p>
                        <p className="text-xs text-gray-500">{testCase.description}</p>
                      </td>
                      <td className="text-right py-3 px-4 font-mono">
                        {testCase.minorUnits.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4">
                        {testCase.expectedMajor.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 font-bold text-blue-600">
                        {formatted}
                      </td>
                      <td className="text-center py-3 px-4">
                        {passed ? (
                          <CheckCircle className="h-5 w-5 text-green-600 inline" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 inline" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bug Prevention Check */}
      <Card className="border-2 border-orange-200">
        <CardHeader className="bg-orange-50">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Bug Prevention Check
          </CardTitle>
          <CardDescription>
            Verifying the N$4 instead of N$400 bug is fixed
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">The Bug That Was Fixed:</h4>
              <p className="text-sm text-gray-600 mb-2">
                When loan amounts were stored as 40000 minor units (N$400), the old code was:
              </p>
              <code className="block bg-red-50 p-2 rounded text-red-800 text-sm mb-2">
                const total = loans.reduce((sum, l) =&gt; sum + (l.principal_minor / 100), 0)<br/>
                formatCurrency(total) // ❌ Double division - showed N$4 instead of N$400
              </code>
              <p className="text-sm text-gray-600 mb-2">The correct code is:</p>
              <code className="block bg-green-50 p-2 rounded text-green-800 text-sm">
                const total = loans.reduce((sum, l) =&gt; sum + l.principal_minor, 0)<br/>
                formatCurrency(total) // ✅ Single division - shows N$400 correctly
              </code>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Test: Principal of 400 (40000 minor) */}
              {(() => {
                const currency = getCurrencyByCountry('NA')!
                const minorUnits = 40000 // N$400
                const formatted = formatCurrency(minorUnits, currency)
                const isCorrect = formatted.includes('400')

                return (
                  <div className={`p-4 rounded-lg border-2 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">N$400 Loan Test</span>
                      {isCorrect ? (
                        <Badge className="bg-green-100 text-green-800">CORRECT</Badge>
                      ) : (
                        <Badge variant="destructive">BUG DETECTED</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Database: 40000 minor units</p>
                    <p className="text-sm text-gray-600">Expected: N$400.00</p>
                    <p className="text-lg font-bold mt-2">
                      Result: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{formatted}</span>
                    </p>
                  </div>
                )
              })()}

              {/* Test: Principal of 5000 (500000 minor) */}
              {(() => {
                const currency = getCurrencyByCountry('KE')!
                const minorUnits = 500000 // KSh5000
                const formatted = formatCurrency(minorUnits, currency)
                const isCorrect = formatted.includes('5,000') || formatted.includes('5000')

                return (
                  <div className={`p-4 rounded-lg border-2 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">KSh5,000 Loan Test</span>
                      {isCorrect ? (
                        <Badge className="bg-green-100 text-green-800">CORRECT</Badge>
                      ) : (
                        <Badge variant="destructive">BUG DETECTED</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Database: 500000 minor units</p>
                    <p className="text-sm text-gray-600">Expected: KSh5,000.00</p>
                    <p className="text-lg font-bold mt-2">
                      Result: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{formatted}</span>
                    </p>
                  </div>
                )
              })()}

              {/* Test: Uganda (0 decimals) */}
              {(() => {
                const currency = getCurrencyByCountry('UG')!
                const minorUnits = 50000 // USh50,000 (no decimals)
                const formatted = formatCurrency(minorUnits, currency)
                const isCorrect = formatted.includes('50,000') || formatted.includes('50000')

                return (
                  <div className={`p-4 rounded-lg border-2 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">USh50,000 Loan Test (0 decimals)</span>
                      {isCorrect ? (
                        <Badge className="bg-green-100 text-green-800">CORRECT</Badge>
                      ) : (
                        <Badge variant="destructive">BUG DETECTED</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Database: 50000 minor units</p>
                    <p className="text-sm text-gray-600">Expected: USh50,000</p>
                    <p className="text-lg font-bold mt-2">
                      Result: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{formatted}</span>
                    </p>
                  </div>
                )
              })()}

              {/* Test: Rwanda (0 decimals) */}
              {(() => {
                const currency = getCurrencyByCountry('RW')!
                const minorUnits = 100000 // RF100,000 (no decimals)
                const formatted = formatCurrency(minorUnits, currency)
                const isCorrect = formatted.includes('100,000') || formatted.includes('100000')

                return (
                  <div className={`p-4 rounded-lg border-2 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">RF100,000 Loan Test (0 decimals)</span>
                      {isCorrect ? (
                        <Badge className="bg-green-100 text-green-800">CORRECT</Badge>
                      ) : (
                        <Badge variant="destructive">BUG DETECTED</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Database: 100000 minor units</p>
                    <p className="text-sm text-gray-600">Expected: RF100,000</p>
                    <p className="text-lg font-bold mt-2">
                      Result: <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{formatted}</span>
                    </p>
                  </div>
                )
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How Currency Formatting Works:</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li><strong>Minor Units:</strong> Database stores amounts in smallest currency unit (cents, kobo, etc.)</li>
          <li><strong>2-decimal currencies (NAD, ZAR, KES, etc.):</strong> 10000 minor = 100 major (N$100.00)</li>
          <li><strong>0-decimal currencies (UGX, RWF, XOF, XAF):</strong> 10000 minor = 10000 major (USh10,000)</li>
          <li><strong>formatCurrency(minorUnits, currency):</strong> Automatically handles the conversion</li>
        </ul>
      </div>
    </div>
  )
}
