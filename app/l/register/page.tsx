'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, Building2, Eye, EyeOff, Globe, CheckCircle, Info } from 'lucide-react'
import * as z from 'zod'

// Lender registration schema with country
const lenderRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  country: z.string().length(2, 'Please select a country'),
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type LenderRegistrationInput = z.infer<typeof lenderRegistrationSchema>

export default function LenderRegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [detectedCountry, setDetectedCountry] = useState<{ code: string; name: string; ip: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<LenderRegistrationInput>({
    resolver: zodResolver(lenderRegistrationSchema),
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

  const onSubmit = async (data: LenderRegistrationInput) => {
    try {
      setIsLoading(true)
      setError(null)

      // Call API route to handle registration with proper permissions
      const response = await fetch('/api/auth/register-lender', {
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
        if (result.errorCode === 'EMAIL_EXISTS_AS_LENDER') {
          setError(result.error || 'This email is already registered as a lender.')
          // Provide a link to login
          setTimeout(() => {
            if (confirm('Would you like to go to the login page?')) {
              router.push('/l/login')
            }
          }, 1000)
          return
        }

        setError(result.error || 'Registration failed. Please try again.')
        return
      }

      // Check if this was an upgrade (existing borrower becoming lender)
      if (result.upgraded) {
        setError(null)
        // Show success message
        alert(result.message || 'Lender role added successfully! You must complete lender profile.')

        // Sign in the user and redirect to profile completion
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })

        if (signInError) {
          setError('Lender role added! Please sign in to complete profile.')
          setTimeout(() => router.push('/l/login'), 2000)
          return
        }

        // Redirect to lender profile completion (middleware will enforce this anyway)
        router.push('/l/complete-profile')
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
        setTimeout(() => router.push('/l/login'), 2000)
        return
      }

      // Redirect to profile completion
      router.push('/l/complete-profile')
    } catch (err) {
      console.error('Registration error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-blue-600 rounded-lg" />
            <span className="text-2xl font-bold">Credlio</span>
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-2xl">Register as Lender</CardTitle>
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
                  placeholder="lender@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register('password')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="flex items-start space-x-2">
                <Controller
                  name="acceptTerms"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="acceptTerms"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="acceptTerms" className="text-sm font-normal">
                  I agree to the{' '}
                  <Link href="/terms" className="text-green-600 hover:text-green-700">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-green-600 hover:text-green-700">
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
                  'Create Lender Account'
                )}
              </Button>

              <div className="text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/l/login" className="text-green-600 hover:text-green-700 font-medium">
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
                <Link href="/b/register" className="text-gray-600 hover:text-gray-800">
                  Register as Borrower
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

      </div>
    </div>
  )
}