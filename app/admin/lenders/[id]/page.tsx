'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  Ban,
  CheckCircle,
  AlertTriangle,
  User,
  Briefcase,
  Image,
  ExternalLink
} from 'lucide-react'
import { format } from 'date-fns'

export default function AdminLenderDetailPage() {
  const [lender, setLender] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [suspendDialog, setSuspendDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [photoDialog, setPhotoDialog] = useState<{ open: boolean; url: string }>({ open: false, url: '' })
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const lenderId = params.id as string

  useEffect(() => {
    if (lenderId) {
      loadLenderDetails()
    }
  }, [lenderId])

  const loadLenderDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Get lender with all details
      const { data: lenderData, error } = await supabase
        .from('lenders')
        .select(`
          *,
          profiles(
            full_name,
            country_code,
            phone_e164,
            onboarding_completed,
            created_at
          )
        `)
        .eq('user_id', lenderId)
        .single()

      if (error) throw error

      setLender({
        ...lenderData,
        full_name: lenderData.profiles?.full_name || 'Unknown',
        country_code: lenderData.profiles?.country_code,
        phone: lenderData.contact_number || lenderData.profiles?.phone_e164,
        member_since: lenderData.profiles?.created_at
      })
    } catch (error) {
      console.error('Error loading lender details:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSuspendLender = async () => {
    setActionLoading(true)
    try {
      const newSuspendedState = !lender.is_suspended

      const { error } = await supabase
        .from('lenders')
        .update({
          is_suspended: newSuspendedState,
          suspension_reason: newSuspendedState ? 'Suspended by admin' : null
        })
        .eq('user_id', lender.user_id)

      if (error) throw error

      setLender({
        ...lender,
        is_suspended: newSuspendedState,
        suspension_reason: newSuspendedState ? 'Suspended by admin' : null
      })

      setSuspendDialog(false)
    } catch (error) {
      console.error('Error updating lender status:', error)
      alert('Failed to update lender status')
    } finally {
      setActionLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!lender) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Lender not found</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/lenders')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Lenders
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/admin/lenders')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              {lender.full_name}
            </h1>
            <p className="text-gray-600 mt-1">Lender Profile Details</p>
          </div>
        </div>
        <Button
          variant={lender.is_suspended ? "default" : "destructive"}
          onClick={() => setSuspendDialog(true)}
        >
          {lender.is_suspended ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Unsuspend Lender
            </>
          ) : (
            <>
              <Ban className="h-4 w-4 mr-2" />
              Suspend Lender
            </>
          )}
        </Button>
      </div>

      {/* Suspension Alert */}
      {lender.is_suspended && (
        <Alert variant="destructive">
          <Ban className="h-4 w-4" />
          <AlertDescription>
            <strong>This lender is suspended.</strong> Reason: {lender.suspension_reason || 'No reason provided'}
          </AlertDescription>
        </Alert>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-medium">{lender.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {lender.email || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {lender.phone || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lender.city || 'N/A'}, {lender.country_code || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Member Since</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {lender.member_since ? format(new Date(lender.member_since), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Profile Status</p>
                {lender.profile_completed ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Complete
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Incomplete
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verification Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Verification Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">ID Type</p>
                <p className="font-medium">{lender.id_type?.replace('_', ' ') || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ID Number</p>
                <p className="font-medium font-mono">{lender.id_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Lending Purpose</p>
                <p className="font-medium flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {lender.lending_purpose?.replace('_', ' ') || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ID Photo</p>
                {lender.id_photo_path ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={async () => {
                      // Get signed URL for private bucket
                      const { data, error } = await supabase.storage
                        .from('lender-id-photos')
                        .createSignedUrl(lender.id_photo_path.replace('lender-id-photos/', ''), 3600) // 1 hour expiry

                      if (error) {
                        console.error('Error getting signed URL:', error)
                        alert('Failed to load ID photo')
                        return
                      }

                      setPhotoDialog({ open: true, url: data.signedUrl })
                    }}
                  >
                    <Image className="h-3 w-3 mr-1" />
                    View ID Photo
                  </Button>
                ) : (
                  <Badge variant="outline">Not Uploaded</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Suspend/Unsuspend Dialog */}
      <AlertDialog open={suspendDialog} onOpenChange={setSuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lender.is_suspended ? 'Unsuspend Lender' : 'Suspend Lender'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lender.is_suspended
                ? `Are you sure you want to unsuspend ${lender.full_name}? They will be able to access their account again.`
                : `Are you sure you want to suspend ${lender.full_name}? They will not be able to access their account or create new loans.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspendLender}
              disabled={actionLoading}
              className={lender.is_suspended ? '' : 'bg-red-600 hover:bg-red-700'}
            >
              {actionLoading ? 'Processing...' : (lender.is_suspended ? 'Unsuspend' : 'Suspend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo View Dialog */}
      <AlertDialog open={photoDialog.open} onOpenChange={(open) => setPhotoDialog({ open, url: '' })}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ID Photo - {lender.full_name}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex justify-center p-4">
            {photoDialog.url && (
              <img
                src={photoDialog.url}
                alt={`ID Photo of ${lender.full_name}`}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.open(photoDialog.url, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
