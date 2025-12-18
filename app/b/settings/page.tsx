'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Bell,
  CreditCard,
  Lock,
  Key,
  Smartphone,
  Globe,
  Eye,
  EyeOff,
  Camera,
  Upload,
  Check,
  X,
  AlertTriangle,
  Info,
  ChevronRight,
  Settings,
  UserCog,
  BellRing,
  ShieldCheck,
  Wallet,
  FileText,
  HelpCircle,
  LogOut,
  Trash2,
  Download,
  Sun,
  Moon,
  Monitor,
  Languages,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  Building2,
  Briefcase,
  DollarSign,
  Banknote,
  Clock,
  UserCheck,
  ExternalLink
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { format } from 'date-fns'

export default function BorrowerSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [notifications, setNotifications] = useState({
    email: {
      paymentReminders: true,
      loanUpdates: true,
      promotions: false,
      newsletter: false
    },
    sms: {
      paymentReminders: true,
      loanUpdates: false,
      securityAlerts: true
    },
    push: {
      all: true,
      paymentDue: true,
      loanApproved: true,
      messages: true
    }
  })
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'private',
    showCreditScore: false,
    dataSharing: false,
    marketingConsent: false
  })
  const [security, setSecurity] = useState({
    twoFactorEnabled: false,
    biometricEnabled: false,
    loginAlerts: true,
    trustedDevices: []
  })
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('en')
  const [verificationStatus, setVerificationStatus] = useState({
    selfieUploaded: false,
    verificationStatus: 'incomplete',
    onboardingComplete: false
  })
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [show2FADialog, setShow2FADialog] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showCameraDialog, setShowCameraDialog] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadUserSettings()
  }, [])

  useEffect(() => {
    // Cleanup: stop camera when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const loadUserSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      // Get profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!profileData) {
        router.push('/b/login')
        return
      }

      setProfile(profileData)
      setAvatarUrl(profileData.avatar_url || null)
      setFormData({
        full_name: profileData.full_name,
        email: profileData.email,
        phone: profileData.phone || '',
        address: profileData.address || '',
        city: profileData.city || '',
        country: profileData.country || '',
        postal_code: profileData.postal_code || '',
        date_of_birth: profileData.date_of_birth || ''
      })

      // Get borrower data
      const { data: borrowerData } = await supabase
        .from('borrowers')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (borrowerData) {
        setBorrower(borrowerData)
        setFormData(prev => ({
          ...prev,
          country_code: borrowerData.country_code || '',
          employment_status: borrowerData.employment_status || '',
          monthly_income: borrowerData.monthly_income || '',
          employer_name: borrowerData.employer_name || '',
          job_title: borrowerData.job_title || ''
        }))

        // Get verification status
        const { data: verificationData } = await supabase
          .from('borrower_self_verification_status')
          .select('selfie_uploaded, verification_status')
          .eq('borrower_id', borrowerData.id)
          .single()

        if (verificationData) {
          setVerificationStatus({
            selfieUploaded: verificationData.selfie_uploaded || false,
            verificationStatus: verificationData.verification_status || 'incomplete',
            onboardingComplete: !!(profileData?.onboarding_completed || (borrowerData?.full_name && borrowerData?.id_number))
          })
        }
      }

      // Load saved preferences (mock data for now)
      // In production, these would be stored in a user_preferences table
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          country: formData.country,
          postal_code: formData.postal_code,
          date_of_birth: formData.date_of_birth,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (!profileError && borrower) {
        // Update borrower data including country_code
        await supabase
          .from('borrowers')
          .update({
            country_code: formData.country_code,
            employment_status: formData.employment_status,
            monthly_income: formData.monthly_income,
            employer_name: formData.employer_name,
            job_title: formData.job_title,
            updated_at: new Date().toISOString()
          })
          .eq('id', borrower.id)
      }

      // Show success message
      alert('Profile updated successfully!')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (!error) {
        alert('Password changed successfully')
        setShowPasswordDialog(false)
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      }
    } catch (error) {
      console.error('Error changing password:', error)
      alert('Failed to change password')
    }
  }

  const handleEnable2FA = async () => {
    // In production, this would generate QR code and setup 2FA
    setSecurity(prev => ({ ...prev, twoFactorEnabled: true }))
    setShow2FADialog(false)
  }

  const handleDeleteAccount = async () => {
    if (confirm('Are you absolutely sure? This action cannot be undone.')) {
      // In production, this would properly delete/anonymize user data
      console.log('Account deletion requested')
      setShowDeleteDialog(false)
    }
  }

  const handleExportData = async () => {
    // In production, this would generate a data export
    console.log('Data export requested')
  }

  const startCamera = async () => {
    try {
      console.log('Starting camera...')

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser')
      }

      // Open dialog first, then get stream
      setShowCameraDialog(true)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false
      })

      console.log('Camera stream obtained:', mediaStream)
      setStream(mediaStream)

      // Give the dialog time to render, then attach stream
      setTimeout(() => {
        if (videoRef.current) {
          console.log('Setting video srcObject after delay')
          videoRef.current.srcObject = mediaStream
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
          })
        }
      }, 100)
    } catch (error: any) {
      console.error('Error accessing camera:', error)
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)

      setShowCameraDialog(false)

      let errorMessage = 'Failed to access camera. '
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow camera permissions in your browser.'
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage += 'No camera found on this device.'
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage += 'Camera is already in use by another application.'
      } else {
        errorMessage += error.message
      }

      alert(errorMessage)
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setShowCameraDialog(false)
    setCapturedImage(null)
  }

  const capturePhoto = () => {
    if (!videoRef.current) {
      console.error('Video ref not available')
      return
    }

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.9)
    console.log('Photo captured successfully')
    setCapturedImage(imageData)
  }

  const retakePhoto = () => {
    setCapturedImage(null)
  }

  const uploadCapturedPhoto = async () => {
    if (!capturedImage) return

    try {
      setUploadingAvatar(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Convert base64 to blob
      const response = await fetch(capturedImage)
      const blob = await response.blob()

      // Validate file size (max 2MB)
      const maxSize = 2 * 1024 * 1024 // 2MB in bytes
      if (blob.size > maxSize) {
        alert('Image size must be less than 2MB. Please retake the photo.')
        return
      }

      // Upload to Supabase Storage
      const fileName = `${Date.now()}.jpg`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id)

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      stopCamera()
      alert('Profile photo updated successfully!')
    } catch (error: any) {
      console.error('Error uploading avatar:', error)
      alert(error.message || 'Failed to upload photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">
            Manage your account settings and preferences
          </p>
        </div>
        <Button onClick={handleSaveProfile} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your personal details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar Section */}
              <div className="flex items-center space-x-6">
                <Avatar className="h-24 w-24">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={formData.full_name || 'User'} />
                  ) : null}
                  <AvatarFallback className="text-2xl">
                    {formData.full_name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={startCamera}
                    disabled={uploadingAvatar}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Take Photo
                  </Button>
                  <p className="text-sm text-gray-600">
                    Click to take a live photo
                  </p>
                </div>
              </div>

              <Separator />

              {/* Personal Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name || ''}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    disabled
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Contact support to change email
                  </p>
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="date_of_birth">Date of Birth</Label>
                  <Input
                    id="date_of_birth"
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-4">
                <h3 className="font-semibold">Address</h3>
                <div>
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city || ''}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code || ''}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={formData.country_code || ''}
                      onValueChange={(value) => setFormData({ ...formData, country_code: value })}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NG">Nigeria</SelectItem>
                        <SelectItem value="KE">Kenya</SelectItem>
                        <SelectItem value="ZA">South Africa</SelectItem>
                        <SelectItem value="GH">Ghana</SelectItem>
                        <SelectItem value="TZ">Tanzania</SelectItem>
                        <SelectItem value="UG">Uganda</SelectItem>
                        <SelectItem value="NA">Namibia</SelectItem>
                        <SelectItem value="ZM">Zambia</SelectItem>
                        <SelectItem value="MW">Malawi</SelectItem>
                        <SelectItem value="RW">Rwanda</SelectItem>
                        <SelectItem value="CM">Cameroon</SelectItem>
                        <SelectItem value="CI">Côte d'Ivoire</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employment Information */}
          <Card>
            <CardHeader>
              <CardTitle>Employment Information</CardTitle>
              <CardDescription>
                Your employment details for loan assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="employment_status">Employment Status</Label>
                  <Select 
                    value={formData.employment_status || ''} 
                    onValueChange={(value) => setFormData({ ...formData, employment_status: value })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employed">Employed</SelectItem>
                      <SelectItem value="self-employed">Self-Employed</SelectItem>
                      <SelectItem value="unemployed">Unemployed</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="monthly_income">Monthly Income</Label>
                  <Input
                    id="monthly_income"
                    type="number"
                    value={formData.monthly_income || ''}
                    onChange={(e) => setFormData({ ...formData, monthly_income: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="employer_name">Employer Name</Label>
                  <Input
                    id="employer_name"
                    value={formData.employer_name || ''}
                    onChange={(e) => setFormData({ ...formData, employer_name: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="job_title">Job Title</Label>
                  <Input
                    id="job_title"
                    value={formData.job_title || ''}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verification Status</CardTitle>
              <CardDescription>
                Complete verification to access all platform features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Completion Overview */}
              <div className="rounded-lg border bg-gradient-to-r from-gray-50 to-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Profile Completion</h4>
                  <span className="text-sm font-medium">
                    {[verificationStatus.onboardingComplete, verificationStatus.selfieUploaded].filter(Boolean).length}/2 steps
                  </span>
                </div>
                <Progress
                  value={([verificationStatus.onboardingComplete, verificationStatus.selfieUploaded].filter(Boolean).length / 2) * 100}
                  className="h-2"
                />

                {/* Step 1: Basic Profile */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  verificationStatus.onboardingComplete ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {verificationStatus.onboardingComplete ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <UserCheck className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${verificationStatus.onboardingComplete ? 'text-green-900' : 'text-orange-900'}`}>
                        Step 1: Basic Profile
                      </p>
                      <p className={`text-xs ${verificationStatus.onboardingComplete ? 'text-green-700' : 'text-orange-700'}`}>
                        {verificationStatus.onboardingComplete ? 'Your profile information is complete' : 'Complete your basic profile information'}
                      </p>
                    </div>
                  </div>
                  {!verificationStatus.onboardingComplete && (
                    <Button size="sm" variant="outline" onClick={() => router.push('/b/onboarding')}>
                      Complete
                    </Button>
                  )}
                </div>

                {/* Step 2: ID Verification */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  verificationStatus.selfieUploaded ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {verificationStatus.selfieUploaded ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Camera className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${verificationStatus.selfieUploaded ? 'text-green-900' : 'text-orange-900'}`}>
                        Step 2: ID Verification
                      </p>
                      <p className={`text-xs ${verificationStatus.selfieUploaded ? 'text-green-700' : 'text-orange-700'}`}>
                        {verificationStatus.selfieUploaded
                          ? 'Your verification photo has been submitted'
                          : 'Upload a selfie with your ID document'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push('/b/verify')}
                    disabled={!verificationStatus.onboardingComplete}
                  >
                    {verificationStatus.selfieUploaded ? 'View' : 'Verify'}
                  </Button>
                </div>

                {/* Verification Status */}
                {verificationStatus.selfieUploaded && (
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    verificationStatus.verificationStatus === 'approved'
                      ? 'bg-green-50 border border-green-200'
                      : verificationStatus.verificationStatus === 'pending'
                        ? 'bg-blue-50 border border-blue-200'
                        : verificationStatus.verificationStatus === 'rejected'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {verificationStatus.verificationStatus === 'approved' ? (
                        <ShieldCheck className="h-5 w-5 text-green-600" />
                      ) : verificationStatus.verificationStatus === 'pending' ? (
                        <Clock className="h-5 w-5 text-blue-600" />
                      ) : verificationStatus.verificationStatus === 'rejected' ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-gray-600" />
                      )}
                      <div>
                        <p className={`font-medium text-sm ${
                          verificationStatus.verificationStatus === 'approved'
                            ? 'text-green-900'
                            : verificationStatus.verificationStatus === 'pending'
                              ? 'text-blue-900'
                              : verificationStatus.verificationStatus === 'rejected'
                                ? 'text-red-900'
                                : 'text-gray-900'
                        }`}>
                          Verification Status
                        </p>
                        <p className={`text-xs ${
                          verificationStatus.verificationStatus === 'approved'
                            ? 'text-green-700'
                            : verificationStatus.verificationStatus === 'pending'
                              ? 'text-blue-700'
                              : verificationStatus.verificationStatus === 'rejected'
                                ? 'text-red-700'
                                : 'text-gray-700'
                        }`}>
                          {verificationStatus.verificationStatus === 'approved'
                            ? 'Your identity has been verified'
                            : verificationStatus.verificationStatus === 'pending'
                              ? 'Pending admin review'
                              : verificationStatus.verificationStatus === 'rejected'
                                ? 'Your verification was rejected'
                                : 'Verification incomplete'}
                        </p>
                      </div>
                    </div>
                    {verificationStatus.verificationStatus === 'approved' && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                        Verified
                      </span>
                    )}
                    {verificationStatus.verificationStatus === 'rejected' && (
                      <Button size="sm" variant="outline" onClick={() => router.push('/b/reupload-selfie')}>
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Profile Information
                  </h4>
                  <p className="text-sm text-gray-500">
                    Update your basic profile and contact details
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/b/onboarding')}
                  >
                    Edit Profile
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    ID Verification
                  </h4>
                  <p className="text-sm text-gray-500">
                    {verificationStatus.selfieUploaded
                      ? 'View or resubmit your verification photo'
                      : 'Submit your ID verification photo'}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(verificationStatus.selfieUploaded ? '/b/verify' : '/b/verify')}
                  >
                    {verificationStatus.selfieUploaded ? 'View Verification' : 'Start Verification'}
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>

              {/* Benefits of Verification */}
              <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Benefits of Verification</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Access to request loans from verified lenders
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Better loan offers and interest rates
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Higher trust score with lenders
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    Faster loan approval process
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password & Authentication</CardTitle>
              <CardDescription>
                Manage your password and authentication methods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-gray-600">
                    Last changed {profile?.password_changed_at ? 
                      format(new Date(profile.password_changed_at), 'MMM dd, yyyy') : 
                      'Never'}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
                  Change Password
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div>
                    <p className="font-medium">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-600">
                      Add an extra layer of security to your account
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {security.twoFactorEnabled ? (
                    <Badge className="bg-green-100 text-green-800">Enabled</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShow2FADialog(true)}
                  >
                    {security.twoFactorEnabled ? 'Manage' : 'Enable'}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div>
                    <p className="font-medium">Biometric Authentication</p>
                    <p className="text-sm text-gray-600">
                      Use fingerprint or face recognition
                    </p>
                  </div>
                </div>
                <Switch
                  checked={security.biometricEnabled}
                  onCheckedChange={(checked) => 
                    setSecurity({ ...security, biometricEnabled: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure additional security options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Login Alerts</p>
                  <p className="text-sm text-gray-600">
                    Get notified of new login attempts
                  </p>
                </div>
                <Switch
                  checked={security.loginAlerts}
                  onCheckedChange={(checked) => 
                    setSecurity({ ...security, loginAlerts: checked })
                  }
                />
              </div>

              <Separator />

              <div>
                <p className="font-medium mb-3">Active Sessions</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Monitor className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium text-sm">Windows - Chrome</p>
                        <p className="text-xs text-gray-600">Current session</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Smartphone className="h-5 w-5 text-gray-600" />
                      <div>
                        <p className="font-medium text-sm">iPhone - Safari</p>
                        <p className="text-xs text-gray-600">Last active 2 hours ago</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-600">
                      Revoke
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose what emails you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Payment Reminders</p>
                  <p className="text-sm text-gray-600">
                    Get reminded before payment due dates
                  </p>
                </div>
                <Switch
                  checked={notifications.email.paymentReminders}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      email: { ...notifications.email, paymentReminders: checked }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Loan Updates</p>
                  <p className="text-sm text-gray-600">
                    Updates about your loan applications and status
                  </p>
                </div>
                <Switch
                  checked={notifications.email.loanUpdates}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      email: { ...notifications.email, loanUpdates: checked }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Promotions & Offers</p>
                  <p className="text-sm text-gray-600">
                    Special offers and promotional rates
                  </p>
                </div>
                <Switch
                  checked={notifications.email.promotions}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      email: { ...notifications.email, promotions: checked }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Newsletter</p>
                  <p className="text-sm text-gray-600">
                    Tips, news, and platform updates
                  </p>
                </div>
                <Switch
                  checked={notifications.email.newsletter}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      email: { ...notifications.email, newsletter: checked }
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SMS Notifications</CardTitle>
              <CardDescription>
                Important alerts sent to your phone
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Payment Reminders</p>
                  <p className="text-sm text-gray-600">
                    SMS alerts for upcoming payments
                  </p>
                </div>
                <Switch
                  checked={notifications.sms.paymentReminders}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      sms: { ...notifications.sms, paymentReminders: checked }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Security Alerts</p>
                  <p className="text-sm text-gray-600">
                    Login attempts and security events
                  </p>
                </div>
                <Switch
                  checked={notifications.sms.securityAlerts}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      sms: { ...notifications.sms, securityAlerts: checked }
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>
                In-app and browser notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable All</p>
                  <p className="text-sm text-gray-600">
                    Receive all push notifications
                  </p>
                </div>
                <Switch
                  checked={notifications.push.all}
                  onCheckedChange={(checked) => 
                    setNotifications({
                      ...notifications,
                      push: { 
                        all: checked,
                        paymentDue: checked,
                        loanApproved: checked,
                        messages: checked
                      }
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>
                Control your privacy and data sharing preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Profile Visibility</Label>
                <RadioGroup 
                  value={privacy.profileVisibility} 
                  onValueChange={(value) => 
                    setPrivacy({ ...privacy, profileVisibility: value })
                  }
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="public" id="public" />
                    <Label htmlFor="public" className="font-normal">
                      Public - Visible to all lenders
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="verified" id="verified" />
                    <Label htmlFor="verified" className="font-normal">
                      Verified Only - Visible to verified lenders
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="private" id="private" />
                    <Label htmlFor="private" className="font-normal">
                      Private - Only visible when you apply
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Credit Score</p>
                    <p className="text-sm text-gray-600">
                      Allow lenders to see your credit score
                    </p>
                  </div>
                  <Switch
                    checked={privacy.showCreditScore}
                    onCheckedChange={(checked) => 
                      setPrivacy({ ...privacy, showCreditScore: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Data Analytics</p>
                    <p className="text-sm text-gray-600">
                      Help improve our services with anonymous data
                    </p>
                  </div>
                  <Switch
                    checked={privacy.dataSharing}
                    onCheckedChange={(checked) => 
                      setPrivacy({ ...privacy, dataSharing: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Marketing Communications</p>
                    <p className="text-sm text-gray-600">
                      Receive marketing and promotional content
                    </p>
                  </div>
                  <Switch
                    checked={privacy.marketingConsent}
                    onCheckedChange={(checked) => 
                      setPrivacy({ ...privacy, marketingConsent: checked })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>
                Manage your personal data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Download Your Data</p>
                  <p className="text-sm text-gray-600">
                    Get a copy of all your data in JSON format
                  </p>
                </div>
                <Button variant="outline" onClick={handleExportData}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Data
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg border-red-200 bg-red-50">
                <div>
                  <p className="font-medium text-red-900">Delete Account</p>
                  <p className="text-sm text-red-700">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>
                Manage your payment methods for loan repayments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CreditCard className="h-5 w-5 text-gray-600" />
                    <div>
                      <p className="font-medium">•••• •••• •••• 4242</p>
                      <p className="text-sm text-gray-600">Expires 12/24</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-100 text-green-800">Default</Badge>
                    <Button size="sm" variant="ghost">
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Banknote className="h-5 w-5 text-gray-600" />
                    <div>
                      <p className="font-medium">Bank Account ****1234</p>
                      <p className="text-sm text-gray-600">Checking Account</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost">
                    Remove
                  </Button>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <CreditCard className="mr-2 h-4 w-4" />
                Add Payment Method
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>
                Your transaction and fee history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">Loan Processing Fee</p>
                    <p className="text-sm text-gray-600">Oct 15, 2024</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">$25.00</p>
                    <Badge className="bg-green-100 text-green-800">Paid</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">Late Payment Fee</p>
                    <p className="text-sm text-gray-600">Sep 20, 2024</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">$15.00</p>
                    <Badge className="bg-green-100 text-green-800">Paid</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>
                Customize your interface settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Theme</Label>
                <RadioGroup 
                  value={theme} 
                  onValueChange={setTheme}
                  className="mt-2 flex space-x-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="light" />
                    <Label htmlFor="light" className="flex items-center font-normal">
                      <Sun className="mr-2 h-4 w-4" />
                      Light
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="dark" />
                    <Label htmlFor="dark" className="flex items-center font-normal">
                      <Moon className="mr-2 h-4 w-4" />
                      Dark
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="system" />
                    <Label htmlFor="system" className="flex items-center font-normal">
                      <Monitor className="mr-2 h-4 w-4" />
                      System
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-2 w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sw">Swahili</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Currency Display</Label>
                <Select defaultValue="USD">
                  <SelectTrigger className="mt-2 w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                    <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                    <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date Format</Label>
                <Select defaultValue="MM/DD/YYYY">
                  <SelectTrigger className="mt-2 w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword}>
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Secure your account with 2FA
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication adds an extra layer of security by requiring a code from your phone in addition to your password.
              </AlertDescription>
            </Alert>
            <div className="text-center py-8">
              <div className="bg-gray-100 p-4 rounded-lg inline-block">
                {/* QR Code would go here */}
                <div className="w-48 h-48 bg-white rounded flex items-center justify-center">
                  <p className="text-gray-500">QR Code</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Scan this QR code with your authenticator app
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShow2FADialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnable2FA}>
              Enable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This action cannot be undone
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">Warning</AlertTitle>
            <AlertDescription className="text-red-700">
              Deleting your account will permanently remove all your data, including loan history, credit score, and personal information. This action cannot be reversed.
            </AlertDescription>
          </Alert>
          <div>
            <Label htmlFor="confirm-delete">
              Type "DELETE" to confirm
            </Label>
            <Input
              id="confirm-delete"
              placeholder="Type DELETE"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              Delete My Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={showCameraDialog} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Take Profile Photo</DialogTitle>
            <DialogDescription>
              Position yourself in the frame and click Capture
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              {!capturedImage ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex justify-center gap-3">
              {!capturedImage ? (
                <>
                  <Button variant="outline" onClick={stopCamera}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button onClick={capturePhoto}>
                    <Camera className="mr-2 h-4 w-4" />
                    Capture Photo
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={retakePhoto}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retake
                  </Button>
                  <Button onClick={uploadCapturedPhoto} disabled={uploadingAvatar}>
                    {uploadingAvatar ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Use This Photo
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}