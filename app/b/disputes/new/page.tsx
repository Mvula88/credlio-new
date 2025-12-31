'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, AlertCircle, AlertTriangle, Upload, X } from 'lucide-react'

const DISPUTE_TYPES = [
  { value: 'payment_not_updated', label: 'Payment Made But Not Updated by Lender' },
  { value: 'incorrect_loan_amount', label: 'Incorrect Loan Amount Reported' },
  { value: 'loan_never_existed', label: 'Loan Never Existed / Fake Entry' },
  { value: 'already_repaid', label: 'Loan Already Fully Repaid' },
  { value: 'incorrect_repayment_status', label: 'Incorrect Repayment Status' },
  { value: 'identity_theft', label: 'Identity Theft / Not My Loan' },
  { value: 'harassment', label: 'Harassment or Extortion' },
  { value: 'other', label: 'Other Issue' },
]

function NewDisputePageContent() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [disputeType, setDisputeType] = useState('')
  const [loanId, setLoanId] = useState('')
  const [description, setDescription] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [uploadingEvidence, setUploadingEvidence] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Pre-fill form from URL parameters (when coming from rejected payment proof)
  useEffect(() => {
    const type = searchParams.get('type')
    const loan = searchParams.get('loan')
    const amount = searchParams.get('amount')
    const reason = searchParams.get('reason')

    if (type) setDisputeType(type)
    if (loan) setLoanId(loan)

    // Pre-fill description for payment disputes
    if (type === 'payment_not_updated' && amount) {
      const prefillDescription = `I made a payment of ${amount} but my lender has not updated my payment status.${reason ? `\n\nLender's rejection reason: "${reason}"\n\nI believe this rejection is incorrect because: ` : '\n\nDetails of my payment:\n- Payment date:\n- Payment method:\n- Reference number:'}`
      setDescription(prefillDescription)
    }
  }, [searchParams])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      // Max 5 files, max 5MB each
      const validFiles = files.filter(f => f.size <= 5 * 1024 * 1024).slice(0, 5)
      setEvidenceFiles(prev => [...prev, ...validFiles].slice(0, 5))
    }
  }

  const removeFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsLoading(true)
      setError(null)

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('You must be logged in to create a dispute')
        return
      }

      // Get borrower ID and country_code
      const { data: borrower, error: borrowerError } = await supabase
        .from('borrowers')
        .select('id, country_code')
        .eq('user_id', user.id)
        .single()

      if (borrowerError || !borrower) {
        setError('Borrower account not found. Only registered borrowers can create disputes.')
        return
      }

      // Create dispute first (without evidence)
      const { data: dispute, error: disputeError } = await supabase
        .from('disputes')
        .insert({
          borrower_id: borrower.id,
          loan_id: loanId || null,
          type: disputeType,
          description: description,
          status: 'open',
          priority: disputeType === 'identity_theft' || disputeType === 'harassment' ? 'high' : 'medium',
          country_code: borrower.country_code,
          created_by: user.id,
          filed_by: 'borrower',
          dispute_type: disputeType,
          title: DISPUTE_TYPES.find(t => t.value === disputeType)?.label || disputeType,
        })
        .select()
        .single()

      if (disputeError) {
        console.error('Dispute creation error:', disputeError)
        setError(`Failed to create dispute: ${disputeError.message}`)
        return
      }

      // Upload evidence files to Supabase Storage
      if (evidenceFiles.length > 0) {
        setUploadingEvidence(true)

        for (const file of evidenceFiles) {
          try {
            // Upload file to storage
            const fileExt = file.name.split('.').pop()
            const fileName = `${user.id}/${dispute.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
            const filePath = `dispute-evidence/${fileName}`

            const { error: uploadError } = await supabase.storage
              .from('evidence')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
              })

            if (uploadError) {
              console.error('File upload error:', uploadError)
              continue // Skip this file and continue with others
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from('evidence')
              .getPublicUrl(filePath)

            // Compute hash for tamper detection
            const buffer = await file.arrayBuffer()
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

            // Store evidence record in dispute_evidence table
            await supabase
              .from('dispute_evidence')
              .insert({
                dispute_id: dispute.id,
                file_url: publicUrl,
                file_hash: fileHash,
                evidence_type: file.type.startsWith('image/') ? 'image' : 'document',
                uploaded_by: user.id
              })

          } catch (err) {
            console.error('Error processing evidence file:', err)
            // Continue with other files
          }
        }

        setUploadingEvidence(false)
      }

      setSuccess(true)

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push('/b/overview')
      }, 2000)

    } catch (err) {
      console.error('Error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Dispute Submitted Successfully!</CardTitle>
            <CardDescription>
              Your dispute has been submitted and will be reviewed by our team within 48 hours.
              You will be notified via email when there's an update.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Redirecting you back to dashboard...
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-2xl">File a Dispute</CardTitle>
            </div>
            <CardDescription>
              Report incorrect loan information, identity theft, or other issues with your credit history.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <AlertDescription className="text-sm">
                  <strong>Your dispute will be reviewed within 48 hours.</strong> Please provide as much detail as possible.
                  All information is kept confidential.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="disputeType">What is the issue? *</Label>
                <Select value={disputeType} onValueChange={setDisputeType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dispute type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPUTE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loanId">Loan ID (if applicable)</Label>
                <Input
                  id="loanId"
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  placeholder="Leave blank if not related to specific loan"
                />
                <p className="text-xs text-gray-600">
                  You can find the Loan ID in your loan history
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please explain the issue in detail. Include dates, amounts, lender name, and any other relevant information..."
                  rows={6}
                  required
                  minLength={50}
                />
                <p className="text-xs text-gray-600">
                  Minimum 50 characters. Be as specific as possible.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="evidence">Supporting Evidence (Optional)</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    id="evidence"
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="evidence"
                    className="flex flex-col items-center cursor-pointer"
                  >
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Click to upload evidence</span>
                    <span className="text-xs text-gray-500 mt-1">
                      Bank statements, receipts, messages (Max 5 files, 5MB each)
                    </span>
                  </label>
                </div>

                {evidenceFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {evidenceFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 p-2 rounded"
                      >
                        <span className="text-sm truncate flex-1">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadingEvidence && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading evidence files...</span>
                  </div>
                )}

                <p className="text-xs text-gray-600 mt-2">
                  ℹ️ Files are securely uploaded and stored for admin review during dispute resolution.
                </p>
              </div>

              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertDescription className="text-sm text-yellow-800">
                  <strong>False disputes may result in account suspension.</strong> Only file disputes for genuine issues.
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !disputeType || description.length < 50}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Dispute'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Your dispute will be reviewed by our team within 48 hours</li>
              <li>We will contact the lender to verify the information</li>
              <li>You'll receive email updates on the progress</li>
              <li>Resolution typically takes 5-10 business days</li>
              <li>If resolved in your favor, the entry will be corrected or removed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function NewDisputePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <NewDisputePageContent />
    </Suspense>
  )
}
