'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { borrowerOnboardingSchema, type BorrowerOnboardingInput } from '@/lib/validations/auth'
import { hashNationalIdAsync } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Loader2, AlertCircle, Shield, Lock, CheckCircle, Camera, Video, RotateCcw, AlertTriangle, MapPin, Briefcase, Phone, Building2, Users, Landmark, Link as LinkIcon } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'

const EMPLOYMENT_STATUS = [
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-Employed' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
]

const INCOME_RANGES = [
  { value: '0-1000', label: '0 - 1,000' },
  { value: '1001-5000', label: '1,001 - 5,000' },
  { value: '5001-10000', label: '5,001 - 10,000' },
  { value: '10001-25000', label: '10,001 - 25,000' },
  { value: '25001-50000', label: '25,001 - 50,000' },
  { value: '50001+', label: '50,001+' },
]

const RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'other', label: 'Other' },
]

export default function BorrowerOnboardingPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<BorrowerOnboardingInput | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<BorrowerOnboardingInput>({
    resolver: zodResolver(borrowerOnboardingSchema),
  })

  const consent = watch('consent')
  const employmentStatus = watch('employmentStatus')

  const onSubmit = async (data: BorrowerOnboardingInput) => {
    // Save form data and move to photo verification step
    setFormData(data)
    setStep(3)
    setIsLoading(false)
  }

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
        audio: false
      })

      setStream(mediaStream)
      setCameraActive(true)

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play()
            .catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Error playing video:', err)
              }
            })
        }
      }, 100)
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access to continue.')
      } else if (error.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera and try again.')
      } else {
        setError('Unable to access camera. Please check your permissions.')
      }
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
      setCameraActive(false)
    }
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        const imageData = canvas.toDataURL('image/jpeg', 0.95)
        setCapturedImage(imageData)
        stopCamera()
      }
    }
  }

  const retakePhoto = () => {
    setCapturedImage(null)
    startCamera()
  }

  const completeOnboarding = async () => {
    if (!formData || !capturedImage) {
      setError('Please complete all steps')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        setError('Session expired. Please login again.')
        router.push('/b/login')
        return
      }

      // Get user profile to get country
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile) {
        setError('Profile not found. Please contact support.')
        return
      }

      // Format phone to E.164
      const phoneE164 = formData.phoneNumber.startsWith('+')
        ? formData.phoneNumber
        : `+${formData.phoneNumber}`

      // Update profile with complete information
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          phone_e164: phoneE164,
          date_of_birth: formData.dateOfBirth,
          consent_timestamp: new Date().toISOString(),
          consent_ip_hash: 'consent_recorded',
          onboarding_completed: true,
        })
        .eq('user_id', user.id)
        .select()

      if (updateError) {
        console.error('Profile update error:', updateError)
        setError('Failed to update profile. Please try again.')
        return
      }

      // Create borrower record with enhanced verification fields
      const { error: borrowerError } = await fetch('/api/borrower/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          nationalId: formData.nationalId,
          phone: phoneE164,
          dateOfBirth: formData.dateOfBirth,
          // Enhanced verification fields
          streetAddress: formData.streetAddress,
          city: formData.city,
          postalCode: formData.postalCode || null,
          employmentStatus: formData.employmentStatus,
          employerName: formData.employerName || null,
          monthlyIncomeRange: formData.monthlyIncomeRange,
          incomeSource: formData.incomeSource,
          emergencyContactName: formData.emergencyContactName,
          emergencyContactPhone: formData.emergencyContactPhone,
          emergencyContactRelationship: formData.emergencyContactRelationship,
          nextOfKinName: formData.nextOfKinName,
          nextOfKinPhone: formData.nextOfKinPhone,
          nextOfKinRelationship: formData.nextOfKinRelationship,
          bankName: formData.bankName,
          bankAccountNumber: formData.bankAccountNumber,
          bankAccountName: formData.bankAccountName,
          linkedinUrl: formData.linkedinUrl || null,
          facebookUrl: formData.facebookUrl || null,
          referrerPhone: formData.referrerPhone || null,
        }),
      }).then(async (res) => {
        const result = await res.json()
        if (!res.ok) {
          return { error: new Error(result.error || 'Failed to create borrower record') }
        }
        return { error: null }
      })

      if (borrowerError) {
        setError(`Failed to complete registration: ${borrowerError.message}`)
        return
      }

      // Upload verification photo
      const response = await fetch(capturedImage)
      const blob = await response.blob()
      const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: 'image/jpeg' })

      // Extract metadata
      const arrayBuffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const now = new Date()
      const fileDate = new Date(file.lastModified)
      const hoursSinceCreation = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60)

      // Get borrower ID
      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        setError('Borrower record not found')
        return
      }

      // Upload file to Supabase Storage
      const fileName = `${user.id}/${fileHash}.jpg`
      const { data: storageData, error: storageError } = await supabase
        .storage
        .from('verification-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (storageError) {
        console.error('Storage upload error:', storageError)
        setError('Failed to upload photo: ' + storageError.message)
        return
      }

      console.log('File uploaded to storage:', storageData.path)

      // Upload document metadata (use upsert to replace existing if re-uploading)
      const { data: docData, error: docError } = await supabase
        .from('borrower_documents')
        .upsert({
          borrower_id: linkData.borrower_id,
          user_id: user.id,
          document_type: 'selfie_with_id',
          file_hash: fileHash,
          file_url: storageData.path, // Store the storage path
          file_size_bytes: file.size,
          file_extension: 'jpg',
          exif_data: {},
          file_created_at: new Date(file.lastModified).toISOString(),
          file_modified_at: new Date(file.lastModified).toISOString(),
          created_recently: hoursSinceCreation < 24,
          missing_exif_data: true,
          is_screenshot: false,
          edited_with_software: false,
          modified_after_creation: false,
          duplicate_hash: false
          // risk_score and risk_factors will be auto-calculated by trigger
        }, {
          onConflict: 'borrower_id,document_type'
        })
        .select()
        .single()

      if (docError) {
        console.error('Document upload error:', docError)
        console.error('Document upload error details:', JSON.stringify(docError, null, 2))
        setError('Failed to upload verification photo: ' + (docError.message || 'Unknown error'))
        return
      }

      console.log('Document uploaded successfully:', docData)

      // Success! Redirect to pending verification page
      router.push('/b/pending-verification')
    } catch (err) {
      console.error('Onboarding error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {step === 1 && 'Getting Started'}
              {step === 2 && 'Profile Information'}
              {step === 3 && 'Identity Verification'}
            </span>
            <span className="text-sm text-gray-600">Step {step} of 3</span>
          </div>
          <Progress value={(step / 3) * 100} className="h-2" />
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            <CardDescription>
              We need to verify your identity to build your credit reputation
            </CardDescription>
          </CardHeader>

          {step === 1 ? (
            <>
              <CardContent className="space-y-6">
                <Alert className="border-blue-200 bg-blue-50">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertTitle>Your Data is Protected</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li className="flex items-start">
                        <Lock className="h-3 w-3 mt-0.5 mr-2 text-blue-600" />
                        Your identity information is encrypted and secure
                      </li>
                      <li className="flex items-start">
                        <Lock className="h-3 w-3 mt-0.5 mr-2 text-blue-600" />
                        We protect your privacy and never share your personal data
                      </li>
                      <li className="flex items-start">
                        <CheckCircle className="h-3 w-3 mt-0.5 mr-2 text-blue-600" />
                        Complete verification once, recognized by all lenders
                      </li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">One-time Verification</p>
                      <p className="text-sm text-gray-600">Complete once, recognized by all lenders</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Build Credit History</p>
                      <p className="text-sm text-gray-600">Every repayment improves your score</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Access Better Rates</p>
                      <p className="text-sm text-gray-600">Good credit unlocks lower interest rates</p>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  onClick={() => setStep(2)}
                >
                  Continue to Verification
                </Button>
              </CardFooter>
            </>
          ) : step === 2 ? (
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-4 max-h-[500px] overflow-y-auto">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* SECTION 1: Basic Identity */}
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900 text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Basic Identity Information
                  </h3>

                  {/* Locked Fields Warning */}
                  <Alert className="bg-red-50 border-red-200">
                    <Lock className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800 text-xs">
                      <strong>Important:</strong> Your name, national ID, phone number, and date of birth <strong>cannot be changed</strong> after submission. Please ensure all information is correct before proceeding.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Legal Name * <span className="text-red-500 text-xs">(Cannot be changed)</span></Label>
                    <Input
                      id="fullName"
                      placeholder="Exactly as it appears on your ID"
                      {...register('fullName')}
                    />
                    <p className="text-xs text-gray-500">Must match your national ID exactly</p>
                    {errors.fullName && (
                      <p className="text-sm text-red-500">{errors.fullName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nationalId">National ID Number * <span className="text-red-500 text-xs">(Cannot be changed)</span></Label>
                    <Input
                      id="nationalId"
                      placeholder="Enter your national ID number"
                      {...register('nationalId')}
                    />
                    <p className="text-xs text-gray-500">Will be immediately hashed for security</p>
                    {errors.nationalId && (
                      <p className="text-sm text-red-500">{errors.nationalId.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number * <span className="text-red-500 text-xs">(Cannot be changed)</span></Label>
                      <Input
                        id="phoneNumber"
                        type="tel"
                        placeholder="+264XXXXXXXXX"
                        {...register('phoneNumber')}
                      />
                      {errors.phoneNumber && (
                        <p className="text-sm text-red-500">{errors.phoneNumber.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth * <span className="text-red-500 text-xs">(Cannot be changed)</span></Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        max={format(new Date(), 'yyyy-MM-dd')}
                        {...register('dateOfBirth')}
                      />
                      {errors.dateOfBirth && (
                        <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Physical Address */}
                <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-green-900 text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Physical Address
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="streetAddress">Street Address *</Label>
                    <Input
                      id="streetAddress"
                      placeholder="House number, street name"
                      {...register('streetAddress')}
                    />
                    {errors.streetAddress && (
                      <p className="text-sm text-red-500">{errors.streetAddress.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City/Town *</Label>
                      <Input
                        id="city"
                        placeholder="Your city"
                        {...register('city')}
                      />
                      {errors.city && (
                        <p className="text-sm text-red-500">{errors.city.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input
                        id="postalCode"
                        placeholder="Optional"
                        {...register('postalCode')}
                      />
                      {errors.postalCode && (
                        <p className="text-sm text-red-500">{errors.postalCode.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Employment & Income */}
                <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h3 className="font-semibold text-purple-900 text-sm flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Employment & Income
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Employment Status *</Label>
                      <Controller
                        name="employmentStatus"
                        control={control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPLOYMENT_STATUS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.employmentStatus && (
                        <p className="text-sm text-red-500">{errors.employmentStatus.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Monthly Income Range *</Label>
                      <Controller
                        name="monthlyIncomeRange"
                        control={control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                            <SelectContent>
                              {INCOME_RANGES.map((range) => (
                                <SelectItem key={range.value} value={range.value}>
                                  {range.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.monthlyIncomeRange && (
                        <p className="text-sm text-red-500">{errors.monthlyIncomeRange.message}</p>
                      )}
                    </div>
                  </div>

                  {(employmentStatus === 'employed' || employmentStatus === 'self_employed') && (
                    <div className="space-y-2">
                      <Label htmlFor="employerName">Employer/Business Name</Label>
                      <Input
                        id="employerName"
                        placeholder="Company or business name"
                        {...register('employerName')}
                      />
                      {errors.employerName && (
                        <p className="text-sm text-red-500">{errors.employerName.message}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="incomeSource">Source of Income *</Label>
                    <Input
                      id="incomeSource"
                      placeholder="e.g., Salary, Business profits, Freelance work"
                      {...register('incomeSource')}
                    />
                    {errors.incomeSource && (
                      <p className="text-sm text-red-500">{errors.incomeSource.message}</p>
                    )}
                  </div>
                </div>

                {/* SECTION 4: Emergency Contact */}
                <div className="space-y-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-orange-900 text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Emergency Contact
                  </h3>
                  <p className="text-xs text-orange-700">Someone who can vouch for you</p>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactName">Full Name *</Label>
                    <Input
                      id="emergencyContactName"
                      placeholder="Emergency contact's full name"
                      {...register('emergencyContactName')}
                    />
                    {errors.emergencyContactName && (
                      <p className="text-sm text-red-500">{errors.emergencyContactName.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">Phone Number *</Label>
                      <Input
                        id="emergencyContactPhone"
                        type="tel"
                        placeholder="+264XXXXXXXXX"
                        {...register('emergencyContactPhone')}
                      />
                      {errors.emergencyContactPhone && (
                        <p className="text-sm text-red-500">{errors.emergencyContactPhone.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Relationship *</Label>
                      <Controller
                        name="emergencyContactRelationship"
                        control={control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIPS.map((rel) => (
                                <SelectItem key={rel.value} value={rel.value}>
                                  {rel.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.emergencyContactRelationship && (
                        <p className="text-sm text-red-500">{errors.emergencyContactRelationship.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 5: Next of Kin */}
                <div className="space-y-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <h3 className="font-semibold text-red-900 text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Next of Kin
                  </h3>
                  <p className="text-xs text-red-700">Must be a different person from emergency contact</p>

                  <div className="space-y-2">
                    <Label htmlFor="nextOfKinName">Full Name *</Label>
                    <Input
                      id="nextOfKinName"
                      placeholder="Next of kin's full name"
                      {...register('nextOfKinName')}
                    />
                    {errors.nextOfKinName && (
                      <p className="text-sm text-red-500">{errors.nextOfKinName.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="nextOfKinPhone">Phone Number *</Label>
                      <Input
                        id="nextOfKinPhone"
                        type="tel"
                        placeholder="+264XXXXXXXXX"
                        {...register('nextOfKinPhone')}
                      />
                      {errors.nextOfKinPhone && (
                        <p className="text-sm text-red-500">{errors.nextOfKinPhone.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Relationship *</Label>
                      <Controller
                        name="nextOfKinRelationship"
                        control={control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIPS.map((rel) => (
                                <SelectItem key={rel.value} value={rel.value}>
                                  {rel.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.nextOfKinRelationship && (
                        <p className="text-sm text-red-500">{errors.nextOfKinRelationship.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 6: Bank Account */}
                <div className="space-y-4 p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                  <h3 className="font-semibold text-cyan-900 text-sm flex items-center gap-2">
                    <Landmark className="h-4 w-4" />
                    Bank Account Information
                  </h3>
                  <p className="text-xs text-cyan-700">Account holder name must match your name</p>

                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name *</Label>
                    <Input
                      id="bankName"
                      placeholder="e.g., First National Bank"
                      {...register('bankName')}
                    />
                    {errors.bankName && (
                      <p className="text-sm text-red-500">{errors.bankName.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="bankAccountNumber">Account Number *</Label>
                      <Input
                        id="bankAccountNumber"
                        placeholder="Your account number"
                        {...register('bankAccountNumber')}
                      />
                      {errors.bankAccountNumber && (
                        <p className="text-sm text-red-500">{errors.bankAccountNumber.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bankAccountName">Account Holder Name *</Label>
                      <Input
                        id="bankAccountName"
                        placeholder="Name on account"
                        {...register('bankAccountName')}
                      />
                      {errors.bankAccountName && (
                        <p className="text-sm text-red-500">{errors.bankAccountName.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 7: Social Media (Optional) */}
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Social Media (Optional - Builds Trust)
                  </h3>
                  <p className="text-xs text-gray-600">Providing social profiles helps verify your digital presence</p>

                  <div className="space-y-2">
                    <Label htmlFor="linkedinUrl">LinkedIn Profile URL</Label>
                    <Input
                      id="linkedinUrl"
                      placeholder="https://linkedin.com/in/yourprofile"
                      {...register('linkedinUrl')}
                    />
                    {errors.linkedinUrl && (
                      <p className="text-sm text-red-500">{errors.linkedinUrl.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="facebookUrl">Facebook Profile URL</Label>
                    <Input
                      id="facebookUrl"
                      placeholder="https://facebook.com/yourprofile"
                      {...register('facebookUrl')}
                    />
                    {errors.facebookUrl && (
                      <p className="text-sm text-red-500">{errors.facebookUrl.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="referrerPhone">Referral Phone (Optional)</Label>
                    <Input
                      id="referrerPhone"
                      type="tel"
                      placeholder="Phone of existing user who referred you"
                      {...register('referrerPhone')}
                    />
                    <p className="text-xs text-gray-500">If someone referred you to Credlio</p>
                    {errors.referrerPhone && (
                      <p className="text-sm text-red-500">{errors.referrerPhone.message}</p>
                    )}
                  </div>
                </div>

                {/* Consent */}
                <div className="flex items-start space-x-2 pt-4">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(checked) => setValue('consent', checked as boolean)}
                  />
                  <Label htmlFor="consent" className="text-sm font-normal">
                    I consent to lenders in my country viewing my repayment history and credit score.
                    I understand this helps me access better loan terms and build my credit reputation.
                    I confirm all information provided is true and accurate.
                  </Label>
                </div>
                {errors.consent && (
                  <p className="text-sm text-red-500">{errors.consent.message}</p>
                )}
              </CardContent>

              <CardFooter className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !consent}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Continue to Photo'
                  )}
                </Button>
              </CardFooter>
            </form>
          ) : (
            <>
              <CardContent className="space-y-6">
                {/* Fraud Warning */}
                <Alert variant="destructive" className="border-2 border-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle className="font-bold">⚠️ WARNING: FRAUD IS A SERIOUS CRIME</AlertTitle>
                  <AlertDescription className="text-xs mt-2">
                    <p className="mb-2">Submitting fake or altered documents will result in:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Criminal charges and up to 5 years imprisonment</li>
                      <li>Permanent ban from all financial services</li>
                      <li>Authorities will be notified</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Instructions */}
                <Alert className="bg-orange-50 border-orange-200">
                  <Camera className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-sm text-orange-900">
                    <strong>IMPORTANT:</strong> Take a LIVE photo NOW holding your ID next to your face.
                    <br />• Make sure your face and ID details are clearly visible
                    <br />• Use good lighting
                    <br />• Hold your ID steady next to your face
                  </AlertDescription>
                </Alert>

                {/* Camera View */}
                <div className="border-2 border-dashed border-orange-300 rounded-lg p-4 bg-black/5">
                  {!cameraActive && !capturedImage && (
                    <div className="text-center py-12">
                      <Video className="h-16 w-16 text-orange-400 mx-auto mb-4" />
                      <p className="text-sm font-medium mb-2">Camera not started</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Click below to start your camera
                      </p>
                      <Button onClick={startCamera} className="bg-orange-600 hover:bg-orange-700">
                        <Camera className="mr-2 h-4 w-4" />
                        Start Camera
                      </Button>
                    </div>
                  )}

                  {cameraActive && !capturedImage && (
                    <div className="space-y-4">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-lg"
                      />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="flex gap-2 justify-center">
                        <Button onClick={capturePhoto} className="bg-orange-600 hover:bg-orange-700">
                          <Camera className="mr-2 h-4 w-4" />
                          Capture Photo
                        </Button>
                        <Button onClick={stopCamera} variant="outline">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {capturedImage && (
                    <div className="space-y-4">
                      <img src={capturedImage} alt="Captured selfie" className="w-full rounded-lg" />
                      <div className="flex gap-2 justify-center">
                        <Button onClick={retakePhoto} variant="outline">
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Retake
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStep(2)
                    stopCamera()
                    setCapturedImage(null)
                  }}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={isLoading || !capturedImage}
                  onClick={completeOnboarding}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Complete Verification
                    </>
                  )}
                </Button>
              </CardFooter>
            </>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500">
          Your information is protected by bank-level encryption and never shared
          outside your country. We comply with all local data protection regulations.
        </p>
      </div>
    </div>
  )
}