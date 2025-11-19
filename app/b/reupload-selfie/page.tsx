'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Camera, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react'

export default function ReuploadSelfiePage() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    return () => {
      // Cleanup camera on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setCameraActive(true)
      }
    } catch (err) {
      setError('Unable to access camera. Please ensure camera permissions are granted.')
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
        const imageData = canvas.toDataURL('image/jpeg', 0.8)
        setCapturedImage(imageData)

        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          setCameraActive(false)
        }
      }
    }
  }

  const retakePhoto = () => {
    setCapturedImage(null)
    startCamera()
  }

  const uploadPhoto = async () => {
    if (!capturedImage) return

    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Convert base64 to file
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

      // Update document metadata
      const { error: docError } = await supabase
        .from('borrower_documents')
        .upsert({
          borrower_id: linkData.borrower_id,
          user_id: user.id,
          document_type: 'selfie_with_id',
          file_hash: fileHash,
          file_url: storageData.path,
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
        }, {
          onConflict: 'borrower_id,document_type'
        })

      if (docError) {
        console.error('Document update error:', docError)
        setError('Failed to update verification record: ' + docError.message)
        return
      }

      // Success! Redirect back to pending verification
      router.push('/b/pending-verification')
    } catch (err) {
      console.error('Upload error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/b/pending-verification')}
              className="w-fit -ml-2 mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-6 w-6" />
              Re-upload Selfie with ID
            </CardTitle>
            <CardDescription>
              Take a new photo of yourself holding your national ID
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!capturedImage ? (
              <div className="space-y-4">
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <Button onClick={startCamera}>
                        <Camera className="h-4 w-4 mr-2" />
                        Start Camera
                      </Button>
                    </div>
                  )}
                </div>

                {cameraActive && (
                  <Button onClick={capturePhoto} className="w-full" size="lg">
                    <Camera className="h-5 w-5 mr-2" />
                    Capture Photo
                  </Button>
                )}

                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>Instructions:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Hold your national ID next to your face</li>
                      <li>Ensure both your face and ID are clearly visible</li>
                      <li>Good lighting is important</li>
                      <li>The name and photo on your ID should be readable</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <img
                    src={capturedImage}
                    alt="Captured selfie"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={retakePhoto}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Retake
                  </Button>
                  <Button
                    onClick={uploadPhoto}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Photo'
                    )}
                  </Button>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
