'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  User,
  Mail,
  Calendar,
  FileText,
  Image as ImageIcon,
  Info
} from 'lucide-react'
import { toast } from 'sonner'

export default function VerificationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const borrowerId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [borrower, setBorrower] = useState<any>(null)
  const [verification, setVerification] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [rejectionReason, setRejectionReason] = useState('')
  const [selfieImageUrl, setSelfieImageUrl] = useState<string | null>(null)

  useEffect(() => {
    loadVerificationData()
  }, [borrowerId])

  const loadVerificationData = async () => {
    try {
      setLoading(true)

      // Get borrower details
      const { data: borrowerData, error: borrowerError } = await supabase
        .from('borrowers')
        .select('*')
        .eq('id', borrowerId)
        .single()

      if (borrowerError) throw borrowerError
      setBorrower(borrowerData)

      // Get verification status
      const { data: verificationData, error: verificationError } = await supabase
        .from('borrower_self_verification_status')
        .select('*')
        .eq('borrower_id', borrowerId)
        .single()

      if (verificationError) throw verificationError
      setVerification(verificationData)

      // Get uploaded documents
      const { data: documentsData, error: documentsError } = await supabase
        .from('borrower_documents')
        .select('*')
        .eq('borrower_id', borrowerId)
        .order('uploaded_at', { ascending: false })

      if (documentsError) throw documentsError
      setDocuments(documentsData || [])

      // Get signed URL for selfie image if it exists
      const selfieDoc = documentsData?.find(d => d.document_type === 'selfie_with_id')
      if (selfieDoc?.file_url) {
        const { data: signedUrlData, error: signedUrlError } = await supabase
          .storage
          .from('verification-photos')
          .createSignedUrl(selfieDoc.file_url, 3600) // 1 hour expiry

        if (!signedUrlError && signedUrlData?.signedUrl) {
          setSelfieImageUrl(signedUrlData.signedUrl)
        } else {
          console.error('Error getting signed URL:', signedUrlError)
        }
      }

    } catch (error) {
      console.error('Error loading verification data:', error)
      toast.error('Failed to load verification data')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    try {
      setSubmitting(true)

      const response = await fetch('/api/admin/verify-borrower', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          borrower_id: borrowerId,
          action: 'approve'
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve verification')
      }

      toast.success('Borrower verification approved!')
      router.push('/admin/verifications')
    } catch (error: any) {
      console.error('Error approving verification:', error)
      toast.error('Failed to approve: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }

    try {
      setSubmitting(true)

      const response = await fetch('/api/admin/verify-borrower', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          borrower_id: borrowerId,
          action: 'reject',
          reason: rejectionReason
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reject verification')
      }

      toast.success('Borrower verification rejected')
      router.push('/admin/verifications')
    } catch (error: any) {
      console.error('Error rejecting verification:', error)
      toast.error('Failed to reject: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  if (!borrower || !verification) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <p className="text-muted-foreground">Verification data not found</p>
      </div>
    )
  }

  const selfieDoc = documents.find(d => d.document_type === 'selfie_with_id')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/verifications')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Verifications
        </Button>
        <h1 className="text-3xl font-bold mt-2 flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          Review Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify borrower identity documents
        </p>
      </div>

      {/* Status Alert */}
      {verification.verification_status === 'approved' && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">Approved</AlertTitle>
          <AlertDescription className="text-green-800">
            This verification has been approved on {new Date(verification.verified_at).toLocaleDateString()}
          </AlertDescription>
        </Alert>
      )}

      {verification.verification_status === 'rejected' && (
        <Alert className="bg-red-50 border-red-200">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-900">Rejected</AlertTitle>
          <AlertDescription className="text-red-800">
            This verification was rejected: {verification.rejection_reason}
          </AlertDescription>
        </Alert>
      )}

      {/* Borrower Info */}
      <Card>
        <CardHeader>
          <CardTitle>Borrower Information (Verify Against ID Photo)</CardTitle>
          <CardDescription className="text-orange-600 font-medium">
            ⚠️ Cross-check this information with the ID in the selfie photo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start gap-2">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Full Legal Name</p>
                <p className="font-bold text-lg">{borrower.full_name}</p>
                <p className="text-xs text-muted-foreground mt-1">Must match name on ID exactly</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Date of Birth</p>
                <p className="font-bold text-lg">
                  {borrower.date_of_birth
                    ? new Date(borrower.date_of_birth).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Not provided'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Verify against ID date of birth</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{borrower.profiles?.email || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Phone Number</p>
                <p className="font-medium">{borrower.phone_e164 || 'Not provided'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(verification.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(verification.verification_status)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Review */}
      <div className="max-w-2xl mx-auto">
        {/* Selfie with ID - ONLY DOCUMENT REQUIRED */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Selfie Holding ID (Live Camera Photo)
            </CardTitle>
            <CardDescription>
              {verification.selfie_uploaded ? 'Uploaded' : 'Not uploaded'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selfieDoc ? (
              <div className="space-y-4">
                {/* Display the selfie image */}
                {selfieImageUrl ? (
                  <div className="border rounded-lg overflow-hidden bg-black">
                    <img
                      src={selfieImageUrl}
                      alt="Selfie with ID"
                      className="w-full h-auto max-h-[500px] object-contain"
                    />
                  </div>
                ) : (
                  <div className="border rounded-lg p-8 bg-gray-100 text-center">
                    <ImageIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {selfieDoc.file_url ? 'Loading image...' : 'No image file uploaded (metadata only)'}
                    </p>
                  </div>
                )}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-sm text-muted-foreground mb-2">Document Hash (SHA-256)</p>
                  <p className="text-xs font-mono break-all">{selfieDoc.file_hash}</p>
                </div>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Verification Checklist:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Photo was taken with live camera (not uploaded/old photo)</li>
                      <li>Borrower is holding their national ID card next to their face</li>
                      <li>Face in photo matches the face on the ID card</li>
                      <li>ID card appears legitimate and not fake/edited</li>
                      <li>Photo quality is sufficient for identification</li>
                      <li>Both face and ID text are clearly visible</li>
                    </ul>
                  </AlertDescription>
                </Alert>
                <div>
                  <p className="text-sm text-muted-foreground">Uploaded</p>
                  <p className="text-sm">{new Date(selfieDoc.uploaded_at).toLocaleString()}</p>
                </div>
                {selfieDoc.risk_score > 0 && (
                  <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                    <p className="text-sm font-medium text-yellow-900 mb-1">Risk Score: {selfieDoc.risk_score}/100</p>
                    <p className="text-xs text-yellow-800">Review carefully - automated fraud detection flagged potential issues</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No document uploaded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Verification Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Checklist</CardTitle>
          <CardDescription>Ensure all criteria are met before approval</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className={`mt-1 ${verification.selfie_uploaded ? 'text-green-600' : 'text-gray-400'}`}>
                {verification.selfie_uploaded ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">Live camera selfie with ID uploaded</p>
                <p className="text-sm text-muted-foreground">Borrower has taken a live photo holding their ID next to their face</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-1 text-yellow-600" />
              <div>
                <p className="font-medium">Manual verification required</p>
                <div className="text-sm text-muted-foreground">
                  <p>Verify that:</p>
                  <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5">
                    <li>The person in the photo matches the ID photo</li>
                    <li>The ID appears legitimate and not fake</li>
                    <li>Both the face and ID are clearly visible</li>
                    <li>The photo appears to be taken with live camera (not old/uploaded)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {verification.verification_status === 'pending' && (
        <Card>
          <CardHeader>
            <CardTitle>Admin Decision</CardTitle>
            <CardDescription>Approve or reject this verification</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Rejection Reason (if rejecting)</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="e.g., ID photo is blurry, face doesn't match ID, ID appears fake..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={submitting || !verification.selfie_uploaded}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4 mr-2" />Approve Verification</>
                  )}
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={submitting}
                  variant="destructive"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing...</>
                  ) : (
                    <><XCircle className="h-4 w-4 mr-2" />Reject Verification</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
