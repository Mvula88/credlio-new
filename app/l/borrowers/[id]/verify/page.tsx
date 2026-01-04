'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Shield,
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Camera,
  ArrowLeft,
  Loader2,
  Info,
  ClipboardList,
  User,
  MapPin,
  Briefcase,
  Landmark,
  Phone,
  Users,
  Link as LinkIcon,
  ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import {
  extractPDFMetadata,
  extractImageMetadata,
  extractVideoMetadata,
  generateFileHash,
  generateMetadataHash,
  getRiskLevel,
  getRiskColor,
  type PDFMetadata,
  type ImageMetadata,
  type VideoMetadata
} from '@/lib/metadata-extraction'

interface DocumentCheck {
  type: string
  label: string
  description: string
  required: boolean
  fileTypes: string[]
  checked: boolean
  metadata?: PDFMetadata | ImageMetadata | VideoMetadata
  fileHash?: string
  status?: 'pending' | 'verified' | 'flagged'
  riskScore?: number
}

const REQUIRED_DOCUMENTS: DocumentCheck[] = [
  {
    type: 'national_id',
    label: 'National ID / Passport',
    description: 'Valid government-issued identification',
    required: true,
    fileTypes: ['image/*', 'application/pdf'],
    checked: false
  },
  {
    type: 'proof_of_address',
    label: 'Proof of Address',
    description: 'Utility bill or bank statement (less than 3 months old)',
    required: true,
    fileTypes: ['image/*', 'application/pdf'],
    checked: false
  },
  {
    type: 'bank_statement',
    label: 'Bank Statements',
    description: 'Last 3 months showing salary deposits',
    required: true,
    fileTypes: ['application/pdf'],
    checked: false
  },
  {
    type: 'payslip',
    label: 'Payslips',
    description: 'Last 3 recent months',
    required: true,
    fileTypes: ['application/pdf', 'image/*'],
    checked: false
  },
  {
    type: 'employment_letter',
    label: 'Employment Letter',
    description: 'Letter from employer confirming employment',
    required: false,
    fileTypes: ['application/pdf', 'image/*'],
    checked: false
  }
]

export default function DocumentVerificationPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const borrowerId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [borrower, setBorrower] = useState<any>(null)
  const [documents, setDocuments] = useState<DocumentCheck[]>(REQUIRED_DOCUMENTS)
  const [videoVerified, setVideoVerified] = useState(false)
  const [videoHash, setVideoHash] = useState<string | null>(null)
  const [overallRiskScore, setOverallRiskScore] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [verificationSummary, setVerificationSummary] = useState<any>(null)
  const [quotaExceeded, setQuotaExceeded] = useState<{ exceeded: boolean; message: string } | null>(null)

  useEffect(() => {
    loadBorrowerData()
  }, [borrowerId])

  useEffect(() => {
    calculateOverallRisk()
  }, [documents, videoVerified])

  const loadBorrowerData = async () => {
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

      // Load existing verifications
      const { data: verificationsData } = await supabase
        .from('document_verifications')
        .select('*')
        .eq('borrower_id', borrowerId)

      if (verificationsData && verificationsData.length > 0) {
        // Update documents with existing verifications
        setDocuments(prev => prev.map(doc => {
          const existing = verificationsData.find((v: any) => v.document_type === doc.type)
          if (existing) {
            return {
              ...doc,
              checked: true,
              status: existing.status,
              riskScore: existing.risk_score,
              metadata: existing.metadata
            }
          }
          return doc
        }))
      }

      // Load verification summary
      const { data: summaryData } = await supabase
        .from('borrower_verification_summary')
        .select('*')
        .eq('borrower_id', borrowerId)
        .single()

      setVerificationSummary(summaryData)

      // Check video verification
      const { data: videoData } = await supabase
        .from('video_verifications')
        .select('*')
        .eq('borrower_id', borrowerId)
        .single()

      if (videoData) {
        setVideoVerified(videoData.passed_verification)
        setVideoHash(videoData.video_hash)
      }

    } catch (error) {
      console.error('Error loading borrower data:', error)
      toast.error('Failed to load borrower data')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (docIndex: number, file: File) => {
    try {
      setProcessing(true)
      setQuotaExceeded(null)
      const doc = documents[docIndex]

      // Get current user and check quota
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please login to verify documents')
        return
      }

      // Check quota for document verification
      const { data: quotaResult, error: quotaError } = await supabase.rpc('check_and_use_quota', {
        p_user_id: user.id,
        p_action: 'document_check'
      })

      if (quotaError) {
        console.error('Quota check error:', quotaError)
        // Continue anyway if quota check fails
      } else if (quotaResult && !quotaResult.allowed) {
        setQuotaExceeded({
          exceeded: true,
          message: quotaResult.upgrade_message || 'Document verification limit reached. Upgrade to continue.'
        })
        setProcessing(false)
        return
      }

      toast.info('Analyzing document metadata...')

      let metadata: PDFMetadata | ImageMetadata | VideoMetadata
      let riskScore = 0
      let riskFactors: string[] = []

      // Extract metadata based on file type
      if (file.type === 'application/pdf') {
        metadata = await extractPDFMetadata(file)
        riskScore = metadata.riskScore
        riskFactors = metadata.riskFactors
      } else if (file.type.startsWith('image/')) {
        metadata = await extractImageMetadata(file)
        riskScore = metadata.riskScore
        riskFactors = metadata.riskFactors
      } else {
        toast.error('Unsupported file type')
        return
      }

      // Generate file hash
      const fileHash = await generateFileHash(file)
      const metadataHash = generateMetadataHash(metadata)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save verification to database
      const { error: saveError } = await supabase
        .from('document_verifications')
        .insert({
          borrower_id: borrowerId,
          lender_id: user.id,
          document_type: doc.type,
          document_name: file.name,
          metadata: metadata,
          metadata_hash: metadataHash,
          file_hash: fileHash,
          creator_software: 'creator' in metadata ? metadata.creator : undefined,
          creation_date: 'creationDate' in metadata ? metadata.creationDate : undefined,
          modification_date: 'modificationDate' in metadata ? metadata.modificationDate : undefined,
          was_modified: 'wasModified' in metadata ? metadata.wasModified : false,
          suspicious_creator: 'suspiciousCreator' in metadata ? metadata.suspiciousCreator : false,
          date_mismatch: 'dateMismatch' in metadata ? metadata.dateMismatch : false,
          recent_creation: 'recentCreation' in metadata ? metadata.recentCreation : false,
          risk_score: riskScore,
          risk_level: getRiskLevel(riskScore),
          risk_factors: riskFactors,
          status: riskScore > 60 ? 'flagged' : 'verified'
        })

      if (saveError) throw saveError

      // Update local state
      const updatedDocs = [...documents]
      updatedDocs[docIndex] = {
        ...doc,
        checked: true,
        metadata,
        fileHash,
        status: riskScore > 60 ? 'flagged' : 'verified',
        riskScore
      }
      setDocuments(updatedDocs)

      // Show result
      if (riskScore > 60) {
        toast.error(`High risk detected! Score: ${riskScore}/100`, {
          description: riskFactors.join(', ')
        })
      } else if (riskScore > 30) {
        toast.warning(`Medium risk. Score: ${riskScore}/100`, {
          description: riskFactors.join(', ')
        })
      } else {
        toast.success(`Document verified! Score: ${riskScore}/100`)
      }

    } catch (error: any) {
      console.error('Error processing document:', error)
      toast.error('Failed to process document: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleVideoVerification = async (file: File) => {
    try {
      setProcessing(true)
      toast.info('Analyzing video...')

      const metadata = await extractVideoMetadata(file)
      const videoHash = await generateFileHash(file)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save video verification
      const { error: saveError } = await supabase
        .from('video_verifications')
        .insert({
          borrower_id: borrowerId,
          lender_id: user.id,
          video_hash: videoHash,
          video_duration_seconds: metadata.duration,
          video_size_bytes: file.size,
          recorded_at: new Date().toISOString(),
          passed_verification: metadata.riskScore < 50,
          risk_flags: metadata.riskFactors
        })

      if (saveError) throw saveError

      setVideoVerified(metadata.riskScore < 50)
      setVideoHash(videoHash)

      if (metadata.riskScore < 50) {
        toast.success('Video verification passed!')
      } else {
        toast.warning('Video verification concerns detected', {
          description: metadata.riskFactors.join(', ')
        })
      }

    } catch (error: any) {
      console.error('Error processing video:', error)
      toast.error('Failed to process video: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  const calculateOverallRisk = () => {
    const verifiedDocs = documents.filter(d => d.checked && d.riskScore !== undefined)
    if (verifiedDocs.length === 0) {
      setOverallRiskScore(0)
      return
    }

    const avgScore = verifiedDocs.reduce((sum, d) => sum + (d.riskScore || 0), 0) / verifiedDocs.length
    setOverallRiskScore(Math.round(avgScore))
  }

  const completionPercentage = () => {
    const requiredDocs = documents.filter(d => d.required)
    const completedRequired = requiredDocs.filter(d => d.checked).length
    const videoProgress = videoVerified ? 1 : 0
    return Math.round(((completedRequired + videoProgress) / (requiredDocs.length + 1)) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/l/borrowers/${borrowerId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Borrower
          </Button>
          <h1 className="text-3xl font-bold mt-2 flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Document Verification
          </h1>
          <p className="text-muted-foreground mt-1">
            Verify {borrower?.full_name}'s documents to prevent fraud
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Overall Risk Score</div>
          <div className={`text-4xl font-bold ${
            overallRiskScore <= 30 ? 'text-green-600' :
            overallRiskScore <= 60 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {overallRiskScore}/100
          </div>
          <Badge className={getRiskColor(getRiskLevel(overallRiskScore))}>
            {getRiskLevel(overallRiskScore).toUpperCase()} RISK
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Progress</CardTitle>
          <CardDescription>
            Complete all required document checks to proceed with loan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completion</span>
              <span>{completionPercentage()}%</span>
            </div>
            <Progress value={completionPercentage()} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Privacy Note:</strong> Documents are analyzed for metadata only and NOT stored on our servers.
          Only verification data and risk scores are saved.
        </AlertDescription>
      </Alert>

      {/* Quota Exceeded Alert */}
      {quotaExceeded?.exceeded && (
        <Alert className="bg-orange-50 border-orange-200">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <strong>Document Verification Limit Reached!</strong>
            <p className="mt-1">{quotaExceeded.message}</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => router.push('/l/billing')}
            >
              Upgrade Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Borrower Info Summary & Document Checklist */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <ClipboardList className="h-5 w-5" />
            What Borrower Provided vs Documents to Request
          </CardTitle>
          <CardDescription>
            Compare what the borrower filled in during onboarding with the documents you should request in person
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - What Borrower Provided */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-gray-700 border-b pb-2">
                Information Provided by Borrower
              </h4>

              {/* Bank Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Landmark className="h-4 w-4 text-gray-500" />
                  Bank Account
                  {borrower?.bank_name ? (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Info Provided</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Not Provided</Badge>
                  )}
                </div>
                <div className="pl-6 text-sm space-y-1">
                  <p><span className="text-gray-500">Bank:</span> {borrower?.bank_name || 'N/A'}</p>
                  <p><span className="text-gray-500">Account #:</span> {borrower?.bank_account_number || 'N/A'}</p>
                  <p><span className="text-gray-500">Account Name:</span> {borrower?.bank_account_name || 'N/A'}</p>
                </div>
              </div>

              {/* Address Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  Address
                  {borrower?.street_address ? (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Info Provided</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Not Provided</Badge>
                  )}
                </div>
                <div className="pl-6 text-sm space-y-1">
                  <p><span className="text-gray-500">Street:</span> {borrower?.street_address || 'N/A'}</p>
                  <p><span className="text-gray-500">City:</span> {borrower?.city || 'N/A'}</p>
                </div>
              </div>

              {/* Employment Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Briefcase className="h-4 w-4 text-gray-500" />
                  Employment
                  {borrower?.employment_status ? (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Info Provided</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Not Provided</Badge>
                  )}
                </div>
                <div className="pl-6 text-sm space-y-1">
                  <p><span className="text-gray-500">Status:</span> {borrower?.employment_status?.replace('_', ' ') || 'N/A'}</p>
                  <p><span className="text-gray-500">Employer:</span> {borrower?.employer_name || 'N/A'}</p>
                  <p><span className="text-gray-500">Income:</span> {borrower?.monthly_income_range || 'N/A'}</p>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Phone className="h-4 w-4 text-gray-500" />
                  Emergency Contact
                  {borrower?.emergency_contact_name ? (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Info Provided</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Not Provided</Badge>
                  )}
                </div>
                <div className="pl-6 text-sm space-y-1">
                  <p><span className="text-gray-500">Name:</span> {borrower?.emergency_contact_name || 'N/A'}</p>
                  <p><span className="text-gray-500">Phone:</span> {borrower?.emergency_contact_phone || 'N/A'}</p>
                </div>
              </div>

              {/* Next of Kin */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-gray-500" />
                  Next of Kin
                  {borrower?.next_of_kin_name ? (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Info Provided</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Not Provided</Badge>
                  )}
                </div>
                <div className="pl-6 text-sm space-y-1">
                  <p><span className="text-gray-500">Name:</span> {borrower?.next_of_kin_name || 'N/A'}</p>
                  <p><span className="text-gray-500">Phone:</span> {borrower?.next_of_kin_phone || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Right Column - Documents to Request */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-gray-700 border-b pb-2">
                Documents to Request from Borrower
              </h4>

              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 text-sm">
                  <strong>Important:</strong> Ask the borrower to bring these documents when you meet in person. Verify that the details match what they provided above.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">1</div>
                    <div>
                      <p className="font-medium text-sm">Bank Statement (Last 3 months)</p>
                      <p className="text-xs text-gray-500">Verify: Account number, account name, salary deposits</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">2</div>
                    <div>
                      <p className="font-medium text-sm">Utility Bill or Lease Agreement</p>
                      <p className="text-xs text-gray-500">Verify: Address matches what was provided</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">3</div>
                    <div>
                      <p className="font-medium text-sm">Payslips (Last 3 months)</p>
                      <p className="text-xs text-gray-500">Verify: Employer name, income matches range</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">4</div>
                    <div>
                      <p className="font-medium text-sm">National ID / Passport</p>
                      <p className="text-xs text-gray-500">Verify: Name, photo matches person</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 border rounded-lg bg-white">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm">5</div>
                    <div>
                      <p className="font-medium text-sm">Employment Letter (Optional)</p>
                      <p className="text-xs text-gray-500">Verify: Employment status, position</p>
                    </div>
                  </div>
                </div>
              </div>

              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 text-sm">
                  <strong>Verification Tip:</strong> Call the emergency contact and next of kin numbers to verify they know the borrower.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Required Documents</CardTitle>
          <CardDescription>
            Upload documents for metadata verification. High-risk documents require manual review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.map((doc, index) => (
            <DocumentCheckItem
              key={doc.type}
              document={doc}
              onFileUpload={(file) => handleFileUpload(index, file)}
              processing={processing}
            />
          ))}
        </CardContent>
      </Card>

      {/* Video Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Video Liveness Verification
          </CardTitle>
          <CardDescription>
            Record a 1-minute video for identity verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VideoVerificationSection
            verified={videoVerified}
            videoHash={videoHash}
            onVideoUpload={handleVideoVerification}
            processing={processing}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// Document check item component
function DocumentCheckItem({
  document,
  onFileUpload,
  processing
}: {
  document: DocumentCheck
  onFileUpload: (file: File) => void
  processing: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileUpload(file)
    }
  }

  return (
    <div className={`p-4 border rounded-lg ${
      document.checked ? 'border-green-200 bg-green-50/50' : 'border-border'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">{document.label}</h3>
            {document.required && (
              <Badge variant="outline" className="text-xs">Required</Badge>
            )}
            {document.status === 'verified' && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
            {document.status === 'flagged' && (
              <Badge className="bg-red-100 text-red-800">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Flagged
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{document.description}</p>

          {document.metadata && (
            <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
              <div>Risk Score: <strong className={
                (document.riskScore || 0) <= 30 ? 'text-green-600' :
                (document.riskScore || 0) <= 60 ? 'text-yellow-600' : 'text-red-600'
              }>{document.riskScore}/100</strong></div>
              {'riskFactors' in document.metadata && document.metadata.riskFactors.length > 0 && (
                <div>Concerns: {document.metadata.riskFactors.join(', ')}</div>
              )}
            </div>
          )}
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={document.fileTypes.join(',')}
            onChange={handleFileChange}
            className="hidden"
            disabled={processing}
          />
          <Button
            size="sm"
            variant={document.checked ? "outline" : "default"}
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : document.checked ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Re-upload
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Video verification section
function VideoVerificationSection({
  verified,
  videoHash,
  onVideoUpload,
  processing
}: {
  verified: boolean
  videoHash: string | null
  onVideoUpload: (file: File) => void
  processing: boolean
}) {
  const videoInputRef = useRef<HTMLInputElement>(null)

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onVideoUpload(file)
    }
  }

  return (
    <div className={`p-4 border rounded-lg ${
      verified ? 'border-green-200 bg-green-50/50' : 'border-border'
    }`}>
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Instructions:</h3>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            <li>Hold your ID next to your face</li>
            <li>Say: "I am [your name] applying for a loan on [today's date]"</li>
            <li>Show the physical document in hand</li>
            <li>Video should be 30-90 seconds long</li>
          </ol>
        </div>

        {verified && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900">
              Video verification completed successfully
            </AlertDescription>
          </Alert>
        )}

        <div>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoChange}
            className="hidden"
            disabled={processing}
          />
          <Button
            onClick={() => videoInputRef.current?.click()}
            disabled={processing}
            variant={verified ? "outline" : "default"}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : verified ? (
              <>
                <Camera className="h-4 w-4 mr-2" />
                Re-upload Video
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Video
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
