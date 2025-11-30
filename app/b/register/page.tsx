'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { borrowerRegistrationSchema, type BorrowerRegistrationInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, User, Info, Globe, CheckCircle } from 'lucide-react'

export default function BorrowerRegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [detectedCountry, setDetectedCountry] = useState<{ code: string; name: string; ip: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<BorrowerRegistrationInput>({
    resolver: zodResolver(borrowerRegistrationSchema),
  })

  const acceptTerms = watch('acceptTerms')

  // Load countries on mount
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('code, name')
          .order('name')

        if (error) throw error
        setCountries(data || [])
      } catch (err) {
        console.error('Error loading countries:', err)
        // Fallback to common countries
        setCountries([
          { code: 'NA', name: 'Namibia' },
          { code: 'ZA', name: 'South Africa' },
          { code: 'BW', name: 'Botswana' },
          { code: 'GH', name: 'Ghana' },
          { code: 'KE', name: 'Kenya' },
          { code: 'NG', name: 'Nigeria' },
        ])
      } finally {
        setLoadingCountries(false)
      }
    }

    loadCountries()
  }, [])

  // Detect country from IP geolocation with fallback
  useEffect(() => {
    const detectCountry = async () => {
      try {
        setDetectingLocation(true)

        // Use multi-API fallback system (ipapi.co → ip-api.com)
        const { detectCountryFromIP, isCountrySupported, getCountryInfo } = await import('@/lib/utils/geolocation')
        const result = await detectCountryFromIP()

        console.log('IP Geolocation result:', result)

        if (result.success && result.country_code) {
          // Check if detected country is in our supported countries list
          const countryInfo = getCountryInfo(result.country_code, countries)

          if (countryInfo) {
            // Auto-select detected country
            setValue('country', result.country_code)

            setDetectedCountry({
              code: result.country_code,
              name: countryInfo.name,
              ip: result.ip || 'Unknown'
            })

            console.log(`✅ Country detected using ${result.api_used}: ${countryInfo.name}`)
          } else {
            console.warn('Detected country not in supported list:', result.country_code)
          }
        } else {
          console.error('Geolocation failed:', result.error)
        }
      } catch (error) {
        console.error('Could not detect country from IP:', error)
        // Silently fail - user will see error message
      } finally {
        setDetectingLocation(false)
      }
    }

    // Only run detection after countries are loaded
    if (countries.length > 0 && !loadingCountries) {
      detectCountry()
    }
  }, [countries, loadingCountries, setValue])

  const onSubmit = async (data: BorrowerRegistrationInput) => {
    try {
      setIsLoading(true)
      setError(null)

      // Call API route to handle registration with proper permissions
      const response = await fetch('/api/auth/register-borrower', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          country: data.country,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        // Handle specific error codes
        if (result.errorCode === 'EMAIL_EXISTS_AS_BORROWER') {
          setError(result.error || 'This email is already registered as a borrower.')
          // Provide a link to login
          setTimeout(() => {
            if (confirm('Would you like to go to the login page?')) {
              router.push('/b/login')
            }
          }, 1000)
          return
        }

        setError(result.error || 'Registration failed. Please try again.')
        return
      }

      // Check if this was an upgrade (existing lender becoming borrower)
      if (result.upgraded) {
        setError(null)
        // Show success message
        alert(result.message || 'Borrower role added successfully! You must complete borrower onboarding.')

        // Sign in the user and redirect to onboarding
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })

        if (signInError) {
          setError('Borrower role added! Please sign in to complete onboarding.')
          setTimeout(() => router.push('/b/login'), 2000)
          return
        }

        // Redirect to borrower onboarding (middleware will enforce this anyway)
        router.push('/b/onboarding')
        return
      }

      // Sign in the user (new account)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (signInError) {
        setError('Account created! Please sign in to continue.')
        // Redirect to login page after a moment
        setTimeout(() => router.push('/b/login'), 2000)
        return
      }

      // Redirect to onboarding to complete profile
      router.push('/b/onboarding')
    } catch (err) {
      console.error('Registration error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/borrower" className="inline-flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg" />
            <span className="text-2xl font-bold">Credlio</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-2xl">Register as Borrower</CardTitle>
            </div>
            <CardDescription>
              Create your account - complete your profile in the next step
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  After registration, you'll complete your profile with your national ID
                  (which will be securely hashed) and other verification details.
                </AlertDescription>
              </Alert>

              {/* Location Detection Info */}
              {detectingLocation && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Globe className="h-4 w-4 text-blue-600 animate-spin" />
                  <AlertDescription className="text-blue-800">
                    <span className="font-semibold">Detecting your location...</span>
                  </AlertDescription>
                </Alert>
              )}

              {detectedCountry && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <span className="font-semibold">✅ {detectedCountry.name}</span> ({detectedCountry.code === 'NA' ? 'N$' : detectedCountry.code === 'ZA' ? 'R' : detectedCountry.code === 'NG' ? '₦' : 'ZK'})
                  </AlertDescription>
                </Alert>
              )}

              {!detectingLocation && !detectedCountry && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertTitle className="text-red-900">Location Detection Failed</AlertTitle>
                  <AlertDescription className="text-red-800">
                    We couldn't automatically detect your country. This is required for registration.
                    Please check your internet connection and refresh the page.
                  </AlertDescription>
                </Alert>
              )}

              {/* Hidden input for country - auto-filled by geolocation */}
              <input type="hidden" {...register('country')} />

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="borrower@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="acceptTerms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setValue('acceptTerms', checked as boolean)}
                />
                <Label htmlFor="acceptTerms" className="text-sm font-normal">
                  I agree to the{' '}
                  <Link href="/terms" className="text-blue-600 hover:text-blue-700">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-blue-600 hover:text-blue-700">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
              {errors.acceptTerms && (
                <p className="text-sm text-red-500">{errors.acceptTerms.message}</p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !acceptTerms || !detectedCountry}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Borrower Account'
                )}
              </Button>

              <div className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/b/login" className="text-blue-600 hover:text-blue-700 font-medium">
                  Sign in
                </Link>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or</span>
                </div>
              </div>

              <div className="text-center text-sm">
                <Link href="/l/register" className="text-gray-600 hover:text-gray-800">
                  Register as Lender
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div className="mt-6 text-center">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                <strong>One Active Loan Policy:</strong> You can only have one active loan at a time. 
                This helps maintain a healthy credit profile and prevents over-borrowing.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}