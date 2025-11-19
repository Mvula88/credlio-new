'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
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
import { Loader2, AlertCircle, Shield, Lock, CheckCircle, Camera, Video, RotateCcw, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

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
    formState: { errors },
  } = useForm<BorrowerOnboardingInput>({
    resolver: zodResolver(borrowerOnboardingSchema),
  })

  const consent = watch('consent')

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

      // Create borrower record
      const { error: borrowerError } = await fetch('/api/borrower/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          nationalId: formData.nationalId,
          phone: phoneE164,
          dateOfBirth: formData.dateOfBirth,
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
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Legal Name</Label>
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
                  <Label htmlFor="nationalId">National ID Number</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="+234XXXXXXXXXX"
                    {...register('phoneNumber')}
                  />
                  <p className="text-xs text-gray-500">Include country code</p>
                  {errors.phoneNumber && (
                    <p className="text-sm text-red-500">{errors.phoneNumber.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
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

                <div className="flex items-start space-x-2 pt-4">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(checked) => setValue('consent', checked as boolean)}
                  />
                  <Label htmlFor="consent" className="text-sm font-normal">
                    I consent to lenders in my country viewing my repayment history and credit score. 
                    I understand this helps me access better loan terms and build my credit reputation.
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
                      Completing Profile...
                    </>
                  ) : (
                    'Complete Profile'
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