'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { lenderProfileSchema, type LenderProfileInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, Building2, CheckCircle, Upload, Camera, Video, RotateCcw } from 'lucide-react'

// Utility function to generate SHA-256 hash of a file
async function generateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

const COUNTRIES = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GH', name: 'Ghana' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'UG', name: 'Uganda' },
  { code: 'NA', name: 'Namibia' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'MW', name: 'Malawi' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CI', name: 'Ivory Coast' },
]

const ID_TYPES = [
  { value: 'national_id', label: 'National ID' },
]

const LENDING_PURPOSES = [
  { value: 'personal', label: 'Personal/Individual Lender' },
  { value: 'business', label: 'Registered Business' },
  { value: 'microfinance', label: 'Microfinance Institution' },
  { value: 'cooperative', label: 'Cooperative/SACCO' },
  { value: 'ngo', label: 'NGO/Non-Profit' },
  { value: 'other', label: 'Other' },
]

export default function CompleteProfilePage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const router = useRouter()
  const supabase = createClient()

  // Live camera capture states
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LenderProfileInput>({
    resolver: zodResolver(lenderProfileSchema),
  })

  // Camera functions
  const startCamera = async () => {
    try {
      console.log('Starting camera...')
      setCameraLoading(true)
      setError(null)

      console.log('Requesting camera access...')
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
        audio: false
      })

      console.log('Camera access granted, stream received:', mediaStream)
      console.log('Stream tracks:', mediaStream.getTracks())

      if (videoRef.current) {
        console.log('Video element exists, attaching stream...')
        console.log('Video element before:', videoRef.current)

        // Set stream and immediately mark as active
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)

        // Try to play immediately without waiting for metadata
        try {
          console.log('Attempting to play video...')
          await videoRef.current.play()
          console.log('Video play() called successfully')
        } catch (playError: any) {
          console.error('Play error:', playError)
          // Try again after a short delay
          setTimeout(async () => {
            try {
              if (videoRef.current) {
                await videoRef.current.play()
                console.log('Video play() succeeded on retry')
              }
            } catch (retryError) {
              console.error('Retry play error:', retryError)
            }
          }, 100)
        }

        // Set active state immediately
        console.log('Setting camera active...')
        setCameraActive(true)
        console.log('Camera should now be active')
      } else {
        console.error('Video ref is null!')
        throw new Error('Video element not found')
      }
    } catch (error: any) {
      console.error('Camera access error:', error)

      // Provide specific error messages based on error type
      if (error.name === 'NotAllowedError') {
        setError(
          'Camera permission was denied or dismissed. ' +
          'To enable camera access: Click the camera icon in your browser address bar, ' +
          'select "Allow" for camera permissions, and refresh the page. ' +
          'Camera access is required for identity verification.'
        )
      } else if (error.name === 'NotFoundError') {
        setError('No camera was found on your device. Please connect a camera and try again.')
      } else if (error.name === 'NotReadableError') {
        setError('Camera is being used by another application. Please close other apps using the camera and try again.')
      } else {
        setError('Unable to access camera: ' + error.message + '. Please check your camera permissions and try again.')
      }
    } finally {
      setCameraLoading(false)
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

        // Convert to File object
        fetch(imageData)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], `id_photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
            setCapturedFile(file)
          })

        stopCamera()
      }
    }
  }

  const retakePhoto = () => {
    setCapturedImage(null)
    setCapturedFile(null)
    startCamera()
  }

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [stream])

  const onSubmit = async (data: LenderProfileInput) => {
    try {
      console.log('Form submitted with data:', data)
      console.log('Captured file exists:', !!capturedFile)
      console.log('Camera active:', cameraActive)
      console.log('Captured image exists:', !!capturedImage)

      setIsLoading(true)
      setError(null)
      setUploadProgress('')

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error('Auth error:', userError)
        setError(`Authentication error: ${userError.message}. Please try refreshing the page or logging in again.`)
        return
      }

      if (!user) {
        setError('Your session has expired. Please log in again.')
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/l/login')
        }, 2000)
        return
      }

      // Get ID photo file from camera capture
      const idPhotoFile = capturedFile
      if (!idPhotoFile) {
        setError('Please capture a photo of yourself holding your ID using the camera')
        return
      }

      // Check for duplicate lender
      const { data: duplicateCheck } = await supabase.rpc('check_duplicate_lender', {
        p_id_number: data.idNumber,
        p_contact_number: data.phoneNumber,
        p_email: user.email,
        p_user_id: user.id
      })

      if (duplicateCheck && duplicateCheck.length > 0) {
        const duplicate = duplicateCheck[0]
        if (duplicate.confidence_score >= 90) {
          setError(`This ${duplicate.duplicate_type.replace('_', ' ')} is already registered. Please contact support if this is an error.`)
          return
        }
      }

      // Upload ID photo to Supabase Storage
      setUploadProgress('Uploading ID photo...')
      const fileExt = idPhotoFile.name.split('.').pop()
      const fileName = `${user.id}/id_photo_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('lender-id-photos')
        .upload(fileName, idPhotoFile, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('Photo upload error:', uploadError)
        setError(`Failed to upload ID photo: ${uploadError.message}`)
        return
      }

      // Generate hash of the photo
      setUploadProgress('Verifying photo integrity...')
      const photoHash = await generateFileHash(idPhotoFile)

      // Update profile
      setUploadProgress('Updating profile...')
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: data.fullName,
          country_code: data.country,
          phone_e164: data.phoneNumber,
          onboarding_completed: true,
        })
        .eq('user_id', user.id)

      if (profileError) {
        console.error('Profile update error:', profileError)
        setError('Failed to update profile. Please try again.')
        return
      }

      // Update lender record - mark profile as completed
      const lenderUpdate: any = {
        profile_completed: true,
        // Country is saved in profiles table, not lenders table
        id_number: data.idNumber,
        id_type: data.idType,
        city: data.city,
        lending_purpose: data.lendingPurpose,
        contact_number: data.phoneNumber,
        email: user.email,
        // email_verified will be set by Supabase when user clicks verification link
        id_photo_path: fileName,
        id_photo_hash: photoHash,
        id_photo_uploaded_at: new Date().toISOString(),
      }

      const { error: lenderError } = await supabase
        .from('lenders')
        .update(lenderUpdate)
        .eq('user_id', user.id)

      if (lenderError) {
        console.error('Failed to update lender:', lenderError)
        setError('Failed to update lender profile. Please try again.')
        return
      }

      // Update user metadata
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: data.fullName,
          country_code: data.country,
        },
      })

      if (metadataError) {
        console.error('Failed to update user metadata:', metadataError)
      }

      // Redirect to dashboard
      router.push('/l/overview')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            </div>
            <CardDescription>
              Provide your information to activate your account. Fields marked with * are required.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {uploadProgress && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>{uploadProgress}</AlertDescription>
                </Alert>
              )}

              {/* REQUIRED SECTION - Personal Identity */}
              <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-900 text-sm">Required Information - Quick & Simple</h3>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Legal Name *</Label>
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    {...register('fullName')}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-red-500">{errors.fullName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number *</Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="+234 800 000 0000"
                    {...register('phoneNumber')}
                  />
                  {errors.phoneNumber && (
                    <p className="text-sm text-red-500">{errors.phoneNumber.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.country && (
                    <p className="text-sm text-red-500">{errors.country.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">City/Town *</Label>
                  <Input
                    id="city"
                    placeholder="Lagos"
                    {...register('city')}
                  />
                  {errors.city && (
                    <p className="text-sm text-red-500">{errors.city.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idType">ID Type *</Label>
                  <Controller
                    name="idType"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ID_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.idType && (
                    <p className="text-sm text-red-500">{errors.idType.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idNumber">ID Number *</Label>
                  <Input
                    id="idNumber"
                    placeholder="Enter your ID number"
                    {...register('idNumber')}
                  />
                  {errors.idNumber && (
                    <p className="text-sm text-red-500">{errors.idNumber.message}</p>
                  )}
                  <p className="text-xs text-gray-600">Your ID number is encrypted and used only for verification</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lendingPurpose">Purpose of Lending *</Label>
                  <Controller
                    name="lendingPurpose"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your lending purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          {LENDING_PURPOSES.map((purpose) => (
                            <SelectItem key={purpose.value} value={purpose.value}>
                              {purpose.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.lendingPurpose && (
                    <p className="text-sm text-red-500">{errors.lendingPurpose.message}</p>
                  )}
                </div>
              </div>

              {/* ID PHOTO VERIFICATION SECTION - LIVE CAMERA */}
              <div className="space-y-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h3 className="font-semibold text-amber-900 text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  ID Verification - Live Camera (Required for Anti-Fraud)
                </h3>
                <Alert className="bg-orange-50 border-orange-200">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-xs text-orange-900">
                    <strong>IMPORTANT:</strong> You must take a LIVE photo holding your ID next to your face.
                    <br />• Make sure your face and ID are clearly visible
                    <br />• Use good lighting
                    <br />• Photo must be taken NOW (no old photos allowed)
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  {/* Always render video element so ref is available */}
                  <div className="relative">
                    {/* Video element - always in DOM but hidden when not active */}
                    <div
                      className="border-2 border-amber-300 rounded-lg overflow-hidden bg-black"
                      style={{ display: (cameraActive || cameraLoading) && !capturedImage ? 'block' : 'none' }}
                    >
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-auto min-h-[300px] object-cover"
                        style={{ display: 'block' }}
                      />
                      <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {/* Start camera UI */}
                    {!cameraActive && !capturedImage && !cameraLoading && (
                      <div className="border-2 border-dashed border-amber-300 rounded-lg p-8 text-center bg-white">
                        <Video className="h-16 w-16 text-amber-400 mx-auto mb-4" />
                        <p className="text-sm font-medium mb-2">Camera not started</p>
                        <p className="text-xs text-muted-foreground mb-4">
                          Click below to start your camera
                        </p>
                        <Button type="button" onClick={startCamera} className="bg-amber-600 hover:bg-amber-700">
                          <Camera className="mr-2 h-4 w-4" />
                          Start Camera
                        </Button>
                      </div>
                    )}

                    {/* Loading overlay */}
                    {cameraLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 border-2 border-amber-300 rounded-lg">
                        <div className="text-center">
                          <Loader2 className="h-16 w-16 text-amber-400 mx-auto mb-4 animate-spin" />
                          <p className="text-sm font-medium mb-2">Starting camera...</p>
                          <p className="text-xs text-muted-foreground">
                            Please allow camera access when prompted
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Camera controls - ALWAYS show when camera is active */}
                  {cameraActive && !capturedImage && (
                    <div className="flex gap-2 justify-center mt-4">
                      <Button type="button" onClick={capturePhoto} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold">
                        <Camera className="mr-2 h-5 w-5" />
                        Capture Photo
                      </Button>
                      <Button type="button" onClick={stopCamera} variant="outline" className="px-6 py-3">
                        Cancel
                      </Button>
                    </div>
                  )}

                  {capturedImage && (
                    <div className="space-y-4">
                      <div className="border-2 border-green-300 rounded-lg overflow-hidden">
                        <img src={capturedImage} alt="Captured ID photo" className="w-full" />
                      </div>
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-xs text-green-900">
                          Photo captured successfully! You can retake if needed, or proceed to submit.
                        </AlertDescription>
                      </Alert>
                      <div className="flex gap-2 justify-center">
                        <Button type="button" onClick={retakePhoto} variant="outline">
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Retake Photo
                        </Button>
                      </div>
                    </div>
                  )}

                  {!capturedFile && (
                    <p className="text-xs text-amber-700 text-center">
                      * You must capture a live photo to continue
                    </p>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Complete Profile
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="mt-6 space-y-3">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <p className="text-sm text-green-800">
                <strong>✅ FREE FOREVER</strong> - No business registration or payment required to start lending.
                Perfect for personal lenders, informal cash loans, and small-scale lending operations.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                <strong>🔒 Your Privacy Matters:</strong> Your ID photo and personal information are encrypted and stored securely.
                Only accessible by admins in fraud investigations. We never share your data with third parties.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
