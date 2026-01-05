'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  TrendingUp,
  Loader2,
  Check,
  X,
  Target,
  Award,
  Download,
  Upload,
  Send,
  Banknote,
  AlertCircle,
  RefreshCw,
  Percent,
  HandCoins,
  Receipt,
  Eye,
  Image,
  FileEdit,
  Landmark
} from 'lucide-react'
import { format, isPast, differenceInDays } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, Tooltip } from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { SetupDeductionDialog } from '@/components/SetupDeductionDialog'

export default function LoanDetailPage() {
  const [loan, setLoan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paymentDialog, setPaymentDialog] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null)
  const [paymentData, setPaymentData] = useState({
    amountPaid: '',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [processingPayment, setProcessingPayment] = useState(false)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)
  const [signedAgreementFile, setSignedAgreementFile] = useState<File | null>(null)
  const [uploadingSignedAgreement, setUploadingSignedAgreement] = useState(false)
  const [agreementData, setAgreementData] = useState<any>(null)
  const [disbursementData, setDisbursementData] = useState<any>(null)
  const [disbursementDialog, setDisbursementDialog] = useState(false)
  const [disbursementForm, setDisbursementForm] = useState({
    amount: '',
    method: 'mobile_money',
    reference: '',
    notes: ''
  })
  const [disbursementFile, setDisbursementFile] = useState<File | null>(null)
  const [submittingDisbursement, setSubmittingDisbursement] = useState(false)
  const [earlyPayoffDialog, setEarlyPayoffDialog] = useState(false)
  const [earlyPayoffInfo, setEarlyPayoffInfo] = useState<any>(null)
  const [processingEarlyPayoff, setProcessingEarlyPayoff] = useState(false)
  const [lateFees, setLateFees] = useState<any[]>([])
  const [lateFeeSummary, setLateFeeSummary] = useState<any>(null)
  const [waivingFee, setWaivingFee] = useState<string | null>(null)
  const [restructureDialog, setRestructureDialog] = useState(false)
  const [restructureForm, setRestructureForm] = useState({
    newTermMonths: '',
    newInterestRate: '',
    reason: '',
    reasonDetails: ''
  })
  const [submittingRestructure, setSubmittingRestructure] = useState(false)
  const [pendingRestructure, setPendingRestructure] = useState<any>(null)
  const [respondingToRestructure, setRespondingToRestructure] = useState(false)
  const [paymentProofs, setPaymentProofs] = useState<any[]>([])
  const [reviewingProof, setReviewingProof] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processingProofReview, setProcessingProofReview] = useState(false)
  const [editingScheduleNotes, setEditingScheduleNotes] = useState<any>(null)
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [setupDeductionOpen, setSetupDeductionOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const disbursementFileRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const loanId = params?.id as string

  useEffect(() => {
    if (loanId) {
      loadLoanDetails()
    }
  }, [loanId])

  const loadLoanDetails = async () => {
    try {
      setLoading(true)

      const { data: loanData, error } = await supabase
        .from('loans')
        .select(`
          *,
          borrowers(
            id,
            full_name,
            phone_e164,
            date_of_birth,
            borrower_scores(score)
          ),
          repayment_schedules(
            id,
            installment_no,
            due_date,
            amount_due_minor,
            principal_minor,
            interest_minor,
            status,
            paid_amount_minor,
            paid_at,
            is_early_payment,
            late_fee_minor,
            repayment_events(
              id,
              amount_paid_minor,
              method,
              paid_at,
              created_at
            )
          )
        `)
        .eq('id', loanId)
        .single()

      if (error) {
        console.error('Loan query error:', JSON.stringify(error))
        throw error
      }

      // Sort schedules by installment number
      if (loanData.repayment_schedules) {
        loanData.repayment_schedules.sort((a: any, b: any) => a.installment_no - b.installment_no)
      }

      setLoan(loanData)

      // Load agreement data
      const { data: agreement } = await supabase
        .from('loan_agreements')
        .select('*')
        .eq('loan_id', loanId)
        .maybeSingle()

      setAgreementData(agreement)

      // Load disbursement data
      const { data: disbursement } = await supabase
        .from('disbursement_proofs')
        .select('*')
        .eq('loan_id', loanId)
        .maybeSingle()

      setDisbursementData(disbursement)

      // Load payment proofs
      const { data: proofs } = await supabase
        .from('payment_proofs')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false })
      setPaymentProofs(proofs || [])

      // Pre-fill disbursement amount with principal
      if (loanData && !disbursement?.lender_submitted_at) {
        setDisbursementForm(prev => ({
          ...prev,
          amount: ((loanData.principal_minor || 0) / 100).toString()
        }))
      }

      // Load late fees for this loan
      const { data: fees } = await supabase
        .from('late_fees')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false })

      setLateFees(fees || [])

      // Get late fee summary
      const { data: feeSummary } = await supabase.rpc('get_loan_late_fees_summary', {
        p_loan_id: loanId
      })
      setLateFeeSummary(feeSummary)

      // Check for pending restructure requests
      const { data: restructure } = await supabase
        .from('loan_restructures')
        .select('*')
        .eq('loan_id', loanId)
        .eq('status', 'pending')
        .maybeSingle()

      setPendingRestructure(restructure)

      // Pre-fill restructure form with current loan terms
      if (loanData) {
        setRestructureForm(prev => ({
          ...prev,
          newTermMonths: (loanData.term_months || 12).toString(),
          newInterestRate: ((loanData.apr_bps || 0) / 100).toString()
        }))
      }
    } catch (error) {
      console.error('Error loading loan:', error)
      toast.error('Failed to load loan details')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsPaid = (schedule: any) => {
    setSelectedSchedule(schedule)
    setPaymentData({
      amountPaid: ((schedule.amount_due_minor || 0) / 100).toString(),
      paymentDate: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setPaymentDialog(true)
  }

  const handleDownloadAgreement = async () => {
    try {
      setDownloadingAgreement(true)
      toast.info('Generating PDF... Please wait')

      // Call API to generate/fetch agreement
      const response = await fetch(`/api/loans/agreement?loanId=${loanId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download agreement')
      }

      // Get the HTML content
      const htmlContent = await response.text()

      // Create a hidden container to render the HTML
      const container = document.createElement('div')
      container.innerHTML = htmlContent
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '210mm' // A4 width
      container.style.padding = '20px'
      container.style.background = 'white'
      container.style.fontFamily = 'Arial, sans-serif'
      document.body.appendChild(container)

      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 500))

      // Convert to canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      // Remove the hidden container
      document.body.removeChild(container)

      // Create PDF
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      // Add additional pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      // Add watermark to all pages
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)

        // Diagonal watermark
        pdf.setTextColor(200, 200, 200) // Light gray
        pdf.setFontSize(60)
        pdf.setFont('helvetica', 'bold')

        // Save graphics state
        const centerX = imgWidth / 2
        const centerY = pageHeight / 2

        // Add rotated text (diagonal watermark)
        pdf.text('CREDLIO', centerX, centerY, {
          angle: 45,
          align: 'center'
        })

        // Footer watermark on each page
        pdf.setFontSize(10)
        pdf.setTextColor(150, 150, 150)
        pdf.text('Powered by Credlio - Secure Lending Platform', imgWidth / 2, pageHeight - 10, {
          align: 'center'
        })

        // Page number
        pdf.setFontSize(9)
        pdf.text(`Page ${i} of ${totalPages}`, imgWidth - 15, pageHeight - 10, {
          align: 'right'
        })
      }

      // Download the PDF
      const borrowerName = loan.borrowers?.full_name?.replace(/\s+/g, '-') || 'borrower'
      const fileName = `Loan-Agreement-${borrowerName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      pdf.save(fileName)

      toast.success('PDF downloaded successfully!')
    } catch (error: any) {
      console.error('Error downloading agreement:', error)
      toast.error(error.message || 'Failed to download loan agreement')
    } finally {
      setDownloadingAgreement(false)
    }
  }

  const handleUploadSignedAgreement = async () => {
    if (!signedAgreementFile || !agreementData) {
      toast.error('Please select a file to upload')
      return
    }

    try {
      setUploadingSignedAgreement(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please sign in to continue')
        return
      }

      // Upload file to Supabase Storage
      const fileExt = signedAgreementFile.name.split('.').pop()
      const fileName = `${user.id}/loan-${loanId}/lender-signed-${Date.now()}.${fileExt}`
      const filePath = `signed-agreements/${fileName}`

      console.log('Uploading to path:', filePath)
      console.log('User ID:', user.id)
      console.log('File size:', signedAgreementFile.size)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(filePath, signedAgreementFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Storage upload error details:', JSON.stringify(uploadError, null, 2))
        throw new Error(uploadError.message || 'Failed to upload file to storage')
      }

      console.log('File uploaded successfully:', uploadData)

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('evidence')
        .getPublicUrl(filePath)

      // Compute hash for tamper detection
      const arrayBuffer = await signedAgreementFile.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const signedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Upload signed agreement using database function
      const { error: dbError } = await supabase
        .rpc('upload_lender_signed_agreement', {
          p_agreement_id: agreementData.id,
          p_signed_url: publicUrl,
          p_signed_hash: signedHash
        })

      if (dbError) {
        console.error('Database RPC error:', JSON.stringify(dbError, null, 2))
        throw new Error(dbError.message || 'Failed to save agreement to database')
      }

      console.log('Agreement saved to database successfully')
      toast.success('✅ Signed agreement uploaded successfully!')
      setSignedAgreementFile(null)

      // Reload loan details to get updated agreement status
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error uploading signed agreement:', error)
      console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
      toast.error(error.message || 'Failed to upload signed agreement')
    } finally {
      setUploadingSignedAgreement(false)
    }
  }

  const handleSubmitDisbursement = async () => {
    if (!loan || !disbursementForm.amount) {
      toast.error('Please enter the disbursement amount')
      return
    }

    try {
      setSubmittingDisbursement(true)

      let proofUrl = null

      // Upload proof file if provided
      if (disbursementFile) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          toast.error('Please sign in to continue')
          return
        }

        const fileExt = disbursementFile.name.split('.').pop()
        const fileName = `${user.id}/loan-${loanId}/disbursement-${Date.now()}.${fileExt}`
        const filePath = `disbursement-proofs/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(filePath, disbursementFile, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('Upload error:', uploadError)
          toast.error('Failed to upload proof: ' + (uploadError.message || 'Storage error'))
          return
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('evidence')
            .getPublicUrl(filePath)
          proofUrl = publicUrl
        }
      }

      // Submit via RPC
      console.log('Calling submit_disbursement_proof with:', {
        p_loan_id: loanId,
        p_amount: parseFloat(disbursementForm.amount),
        p_method: disbursementForm.method,
        p_reference: disbursementForm.reference || null,
        p_proof_url: proofUrl,
        p_notes: disbursementForm.notes || null
      })

      const { data, error } = await supabase.rpc('submit_disbursement_proof', {
        p_loan_id: loanId,
        p_amount: parseFloat(disbursementForm.amount),
        p_method: disbursementForm.method,
        p_reference: disbursementForm.reference || null,
        p_proof_url: proofUrl,
        p_notes: disbursementForm.notes || null
      })

      console.log('RPC result:', { data, error })

      if (error) {
        console.error('RPC error details:', JSON.stringify(error, null, 2))
        throw new Error(error.message || error.details || 'RPC call failed')
      }

      toast.success('Proof of payment uploaded! Waiting for borrower to confirm they received the money.')
      setDisbursementDialog(false)
      setDisbursementFile(null)

      // Reload loan details
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error submitting disbursement:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      toast.error(error.message || 'Failed to submit proof of payment')
    } finally {
      setSubmittingDisbursement(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedSchedule || !loan) return

    try {
      setProcessingPayment(true)

      const amount = parseFloat(paymentData.amountPaid)

      // Use the improved process_repayment function which:
      // - Automatically allocates payment to schedules (oldest first)
      // - Handles early payments, partial payments, and overpayments
      // - Updates loan total_repaid
      // - Sends notifications
      // - Marks loan as completed if fully paid
      // - Updates borrower credit score
      const { data: result, error: paymentError } = await supabase.rpc('process_repayment', {
        p_loan_id: loan.id,
        p_amount: amount,
      })

      if (paymentError) {
        throw new Error(paymentError.message || 'Failed to process payment')
      }

      // Show success message with details
      if (result) {
        if (result.loan_completed) {
          toast.success(`Loan fully repaid! ${result.overpayment > 0 ? `(Overpayment: ${formatCurrency(result.overpayment * 100, loan.country_code)})` : ''}`)
        } else {
          toast.success(`Payment recorded! ${result.schedules_paid} installment(s) paid. Remaining: ${formatCurrency(result.remaining * 100, loan.country_code)}`)
        }
      } else {
        toast.success('Payment recorded successfully')
      }

      setPaymentDialog(false)
      setSelectedSchedule(null)
      setPaymentData({
        amountPaid: '',
        paymentDate: new Date().toISOString().split('T')[0],
        notes: '',
      })

      // Reload loan details
      loadLoanDetails()
    } catch (error: any) {
      console.error('Payment error:', error)
      toast.error(error.message || 'Failed to record payment')
    } finally {
      setProcessingPayment(false)
    }
  }

  const handleShowEarlyPayoff = async () => {
    try {
      // Get early payoff amount from database function
      const { data, error } = await supabase.rpc('get_early_payoff_amount', {
        p_loan_id: loan.id,
      })

      if (error) {
        toast.error('Failed to get payoff amount')
        return
      }

      setEarlyPayoffInfo(data)
      setEarlyPayoffDialog(true)
    } catch (error) {
      console.error('Error getting early payoff:', error)
      toast.error('Failed to get payoff amount')
    }
  }

  const handleProcessEarlyPayoff = async () => {
    if (!earlyPayoffInfo) return

    try {
      setProcessingEarlyPayoff(true)

      // Process the full remaining balance
      const { data: result, error } = await supabase.rpc('process_repayment', {
        p_loan_id: loan.id,
        p_amount: earlyPayoffInfo.remaining_balance,
      })

      if (error) {
        throw new Error(error.message || 'Failed to process early payoff')
      }

      if (result?.loan_completed) {
        toast.success('Loan fully paid off! Congratulations!')
      } else {
        toast.success('Payment processed successfully')
      }

      setEarlyPayoffDialog(false)
      setEarlyPayoffInfo(null)

      // Reload loan details
      loadLoanDetails()
    } catch (error: any) {
      console.error('Early payoff error:', error)
      toast.error(error.message || 'Failed to process early payoff')
    } finally {
      setProcessingEarlyPayoff(false)
    }
  }

  const handleCalculateLateFees = async () => {
    try {
      toast.info('Calculating late fees...')
      const { data, error } = await supabase.rpc('calculate_late_fees', {
        p_loan_id: loan.id
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.total_fees_applied_minor > 0) {
        toast.success(`Late fees applied: ${formatCurrency(data.total_fees_applied_minor, loan.country_code)}`)
      } else {
        toast.info('No new late fees to apply')
      }

      // Reload loan details to show new fees
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error calculating late fees:', error)
      toast.error(error.message || 'Failed to calculate late fees')
    }
  }

  const handleWaiveLateFee = async (feeId: string) => {
    try {
      setWaivingFee(feeId)
      const { error } = await supabase.rpc('waive_late_fee', {
        p_late_fee_id: feeId,
        p_reason: 'Waived by lender'
      })

      if (error) {
        throw new Error(error.message)
      }

      toast.success('Late fee waived successfully')
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error waiving fee:', error)
      toast.error(error.message || 'Failed to waive late fee')
    } finally {
      setWaivingFee(null)
    }
  }

  const handleApprovePaymentProof = async (proofId: string) => {
    try {
      setProcessingProofReview(true)
      const { data, error } = await supabase.rpc('review_payment_proof', {
        p_proof_id: proofId,
        p_action: 'approve'
      })

      if (error) throw new Error(error.message)

      toast.success('Payment proof approved and payment recorded!')
      setReviewingProof(null)
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error approving proof:', error)
      toast.error(error.message || 'Failed to approve payment proof')
    } finally {
      setProcessingProofReview(false)
    }
  }

  const handleRejectPaymentProof = async (proofId: string) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }

    try {
      setProcessingProofReview(true)
      const { error } = await supabase.rpc('review_payment_proof', {
        p_proof_id: proofId,
        p_action: 'reject',
        p_rejection_reason: rejectReason
      })

      if (error) throw new Error(error.message)

      toast.success('Payment proof rejected')
      setReviewingProof(null)
      setRejectReason('')
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error rejecting proof:', error)
      toast.error(error.message || 'Failed to reject payment proof')
    } finally {
      setProcessingProofReview(false)
    }
  }

  const handleSaveScheduleNotes = async () => {
    if (!editingScheduleNotes || !scheduleNotes.trim()) {
      toast.error('Please provide a reason')
      return
    }

    try {
      setSavingNotes(true)
      const { data, error } = await supabase.rpc('update_payment_lender_notes', {
        p_schedule_id: editingScheduleNotes.id,
        p_notes: scheduleNotes.trim()
      })

      if (error) throw new Error(error.message)

      const result = data as { success: boolean; error?: string; message?: string }
      if (!result.success) {
        throw new Error(result.error || 'Failed to save notes')
      }

      toast.success('Notes saved successfully')
      setEditingScheduleNotes(null)
      setScheduleNotes('')
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error saving notes:', error)
      toast.error(error.message || 'Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const handleRequestRestructure = async () => {
    if (!restructureForm.newTermMonths || !restructureForm.reason) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setSubmittingRestructure(true)

      const { data, error } = await supabase.rpc('request_loan_restructure', {
        p_loan_id: loan.id,
        p_new_term_months: parseInt(restructureForm.newTermMonths),
        p_new_interest_rate: parseFloat(restructureForm.newInterestRate) || (loan.apr_bps / 100),
        p_reason: restructureForm.reason,
        p_reason_details: restructureForm.reasonDetails || null
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast.success('Restructure request sent! Waiting for borrower to approve.')
      setRestructureDialog(false)
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error requesting restructure:', error)
      toast.error(error.message || 'Failed to request restructure')
    } finally {
      setSubmittingRestructure(false)
    }
  }

  const handleRespondToRestructure = async (approve: boolean) => {
    if (!pendingRestructure) return

    try {
      setRespondingToRestructure(true)

      const { data, error } = await supabase.rpc('respond_to_restructure', {
        p_restructure_id: pendingRestructure.id,
        p_approve: approve,
        p_rejection_reason: approve ? null : 'Declined by lender'
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast.success(approve ? 'Restructure approved and applied!' : 'Restructure request declined')
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error responding to restructure:', error)
      toast.error(error.message || 'Failed to respond to restructure')
    } finally {
      setRespondingToRestructure(false)
    }
  }

  const formatCurrency = (amountMinor: number, countryCode?: string) => {
    if (countryCode) {
      const currency = getCurrencyByCountry(countryCode)
      if (currency) {
        return formatCurrencyUtil(amountMinor, currency)
      }
    }
    // USD fallback
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Partial</Badge>
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      case 'overdue':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Helper to check if a schedule is paid
  const isSchedulePaid = (schedule: any) => {
    // First check the status column if available
    if (schedule.status === 'paid') return true
    if (schedule.status === 'partial' || schedule.status === 'pending' || schedule.status === 'overdue') return false

    // Fallback to checking repayment events for backwards compatibility
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
    const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
    return totalPaid >= schedule.amount_due_minor
  }

  // Helper to check if schedule is partially paid
  const isSchedulePartial = (schedule: any) => {
    // First check the status column if available
    if (schedule.status === 'partial') return true
    if (schedule.status === 'paid') return false

    // Fallback to checking repayment events
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
    const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
    return totalPaid > 0 && totalPaid < schedule.amount_due_minor
  }

  // Get the paid_at date for a schedule (most recent event)
  const getSchedulePaidAt = (schedule: any) => {
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return null
    const sorted = [...schedule.repayment_events].sort((a, b) =>
      new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
    )
    return sorted[0]?.paid_at
  }

  const getScheduleStatus = (schedule: any) => {
    // Use the status column if available
    if (schedule.status) return schedule.status

    // Fallback to computed status
    if (isSchedulePaid(schedule)) return 'paid'
    if (isSchedulePartial(schedule)) return 'partial'
    if (isPast(new Date(schedule.due_date))) return 'overdue'
    return 'pending'
  }

  const calculateProgress = () => {
    if (!loan || !loan.repayment_schedules) return 0

    // Use amount-based progress instead of schedule-count-based progress
    // This shows partial payment progress correctly
    const totalDue = loan.repayment_schedules.reduce((sum: number, s: any) => sum + (s.amount_due_minor || 0), 0)
    const totalPaid = loan.repayment_schedules.reduce((sum: number, s: any) => sum + (s.paid_amount_minor || 0), 0)

    return totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0
  }

  // Helper to collect all repayment events from schedules
  const getAllRepaymentEvents = () => {
    if (!loan || !loan.repayment_schedules) return []
    const events: any[] = []
    loan.repayment_schedules.forEach((schedule: any) => {
      if (schedule.repayment_events) {
        schedule.repayment_events.forEach((event: any) => {
          events.push({
            ...event,
            schedule_id: schedule.id,
            installment_no: schedule.installment_no
          })
        })
      }
    })
    // Sort by date, most recent first
    return events.sort((a, b) => new Date(b.paid_at || b.created_at).getTime() - new Date(a.paid_at || a.created_at).getTime())
  }

  const calculateTotalPaid = () => {
    const events = getAllRepaymentEvents()
    return events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
  }

  const calculateOutstanding = () => {
    if (!loan) return 0
    const totalDue = loan.total_minor || 0
    const totalPaid = calculateTotalPaid()
    return totalDue - totalPaid
  }

  const getPaymentAnalytics = () => {
    if (!loan || !loan.repayment_schedules) {
      return {
        totalPayments: 0,
        paidPayments: 0,
        onTimePayments: 0,
        latePayments: 0,
        pendingPayments: 0,
        overduePayments: 0,
        progressPercentage: 0,
        paymentHealthScore: 0,
        totalDueMinor: 0,
        totalPaidMinor: 0,
      }
    }

    const schedules = loan.repayment_schedules
    const totalPayments = schedules.length
    const paidPayments = schedules.filter((s: any) => isSchedulePaid(s)).length

    // Calculate amount-based progress (includes partial payments)
    const totalDueMinor = schedules.reduce((sum: number, s: any) => sum + (s.amount_due_minor || 0), 0)
    const totalPaidMinor = schedules.reduce((sum: number, s: any) => sum + (s.paid_amount_minor || 0), 0)

    let onTimePayments = 0
    let latePayments = 0

    schedules.forEach((s: any) => {
      if (isSchedulePaid(s)) {
        const paidAt = getSchedulePaidAt(s)
        if (paidAt) {
          const dueDate = new Date(s.due_date)
          const paidDate = new Date(paidAt)
          if (paidDate <= dueDate) {
            onTimePayments++
          } else {
            latePayments++
          }
        }
      }
    })

    const pendingPayments = schedules.filter((s: any) => !isSchedulePaid(s) && !isPast(new Date(s.due_date))).length
    const overduePayments = schedules.filter((s: any) => {
      if (isSchedulePaid(s)) return false
      return isPast(new Date(s.due_date))
    }).length

    // Use amount-based progress instead of schedule-count-based progress
    // This shows partial payment progress correctly
    const progressPercentage = totalDueMinor > 0 ? Math.round((totalPaidMinor / totalDueMinor) * 100) : 0

    // Health score: 100 if all on time, decrease for late/overdue payments
    let healthScore = 100
    if (paidPayments > 0) {
      healthScore = Math.round((onTimePayments / paidPayments) * 100)
    }
    if (overduePayments > 0) {
      healthScore = Math.max(0, healthScore - (overduePayments * 10))
    }

    return {
      totalPayments,
      paidPayments,
      onTimePayments,
      latePayments,
      pendingPayments,
      overduePayments,
      progressPercentage,
      paymentHealthScore: healthScore,
      totalDueMinor,
      totalPaidMinor,
    }
  }

  const getRadialChartData = () => {
    const analytics = getPaymentAnalytics()

    return [
      {
        name: 'Loan Progress',
        value: analytics.progressPercentage,
        fill: analytics.paymentHealthScore >= 80 ? '#22c55e' :
              analytics.paymentHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  if (!loan) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertTriangle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Loan not found</h2>
        <Button onClick={() => router.push('/l/loans')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Loans
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/l/loans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Loan Details</h1>
            <p className="text-muted-foreground">#{loan.id.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadAgreement}
            disabled={downloadingAgreement}
            className="bg-blue-50 hover:bg-blue-100 border-blue-200"
          >
            {downloadingAgreement ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
          <Badge variant={loan.status === 'active' ? 'default' : loan.status === 'completed' ? 'secondary' : 'destructive'}>
            {loan.status}
          </Badge>
        </div>
      </div>

      {/* Loan Breakdown - Clear Interest Calculation */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Loan Terms & Interest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-gray-600">Principal</p>
              <p className="text-xl font-bold">{formatCurrency(loan.principal_minor || 0, loan.country_code)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Interest Rate</p>
              <p className="text-xl font-bold text-orange-600">
                {loan.total_interest_percent || loan.base_rate_percent || (loan.apr_bps / 100)}%
              </p>
              {loan.payment_type === 'installments' && loan.extra_rate_per_installment > 0 && (
                <p className="text-xs text-gray-500">
                  ({loan.base_rate_percent}% base + {loan.extra_rate_per_installment}% × {(loan.num_installments || 1) - 1})
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Interest Amount</p>
              <p className="text-xl font-bold text-orange-600">
                {formatCurrency(loan.interest_amount_minor || ((loan.total_minor || 0) - (loan.principal_minor || 0)), loan.country_code)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Payment Type</p>
              <p className="text-xl font-bold">
                {loan.payment_type === 'once_off' ? 'Once-off' : `${loan.num_installments || loan.term_months} Installments`}
              </p>
            </div>
            <div className="bg-blue-100 rounded-lg p-3">
              <p className="text-sm text-blue-700">Total to Receive</p>
              <p className="text-xl font-bold text-blue-900">
                {formatCurrency(loan.total_amount_minor || loan.total_minor || 0, loan.country_code)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Principal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(loan.principal_minor || 0, loan.country_code)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(loan.total_amount_minor || loan.total_minor || 0, loan.country_code)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(calculateTotalPaid(), loan.country_code)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(calculateOutstanding(), loan.country_code)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signed Agreement Section */}
      {agreementData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Loan Agreement Signatures
            </CardTitle>
            <CardDescription>
              Both parties must upload their signed copy of the agreement for legal validity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lender Signature Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Your Signature (Lender)</h3>
                  {agreementData.lender_signed_at ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Signed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  )}
                </div>

                {agreementData.lender_signed_at ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-900">
                      <strong>Signed on:</strong> {format(new Date(agreementData.lender_signed_at), 'MMM d, yyyy HH:mm')}
                    </p>
                    {agreementData.lender_signed_url && (
                      <a
                        href={agreementData.lender_signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"
                      >
                        <Download className="h-3 w-3" />
                        View Signed Copy
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Alert>
                      <AlertDescription className="text-sm">
                        Download the agreement, sign it, and upload a photo/PDF of the signed document
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                      <Label>Upload Signed Agreement</Label>

                      {/* Hidden file input with ref */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          console.log('Lender file selected:', file?.name, file?.size)
                          if (file) {
                            if (file.size > 25 * 1024 * 1024) {
                              toast.error('File size must be less than 25MB')
                              e.target.value = ''
                              return
                            }
                            setSignedAgreementFile(file)
                            toast.success(`File selected: ${file.name}`)
                          }
                        }}
                      />

                      {/* Visible button to trigger file picker */}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed border-2 h-20"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <FileText className="h-6 w-6 text-blue-600" />
                          <span className="text-sm">Click to select a file</span>
                          <span className="text-xs text-muted-foreground">Images or PDF (max 25MB)</span>
                        </div>
                      </Button>

                      {signedAgreementFile && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-green-800">File selected:</p>
                            <p className="text-sm text-green-600">{signedAgreementFile.name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSignedAgreementFile(null)
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      )}

                      <Button
                        onClick={handleUploadSignedAgreement}
                        disabled={!signedAgreementFile || uploadingSignedAgreement}
                        className="w-full"
                      >
                        {uploadingSignedAgreement ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload My Signed Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Borrower Signature Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Borrower's Signature</h3>
                  {agreementData.borrower_signed_at ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Signed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  )}
                </div>

                {agreementData.borrower_signed_at ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-900">
                      <strong>Signed on:</strong> {format(new Date(agreementData.borrower_signed_at), 'MMM d, yyyy HH:mm')}
                    </p>
                    {agreementData.borrower_signed_url && (
                      <a
                        href={agreementData.borrower_signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"
                      >
                        <Download className="h-3 w-3" />
                        View Signed Copy
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-sm text-gray-600">
                      Waiting for borrower to sign and upload their copy...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Fully Signed Status */}
            {agreementData.fully_signed && (
              <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-900">
                  <CheckCircle className="h-5 w-5" />
                  <strong>Agreement Fully Executed</strong>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Both parties have signed on {format(new Date(agreementData.fully_signed_at), 'MMM d, yyyy HH:mm')}.
                  The agreement is now legally binding.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send Money & Upload Proof Section - Show for pending_disbursement status */}
      {loan.status === 'pending_disbursement' && (
        <Card className="border-2 border-orange-200 bg-orange-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-orange-600" />
              Send Money to Borrower
            </CardTitle>
            <CardDescription>
              The agreement is signed. Now send the loan amount to the borrower and upload proof of payment (bank receipt, mobile money screenshot, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {disbursementData?.lender_submitted_at ? (
              // Lender has submitted proof, waiting for borrower
              <div className="space-y-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900">
                    You have uploaded your proof of payment. Waiting for {loan.borrowers?.full_name} to confirm they received the money.
                  </AlertDescription>
                </Alert>

                <div className="bg-white rounded-lg border p-4 space-y-2">
                  <h4 className="font-semibold">Payment Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Amount Sent:</span>
                      <p className="font-medium">{formatCurrency((disbursementData.lender_proof_amount || 0) * 100, loan.country_code)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Method:</span>
                      <p className="font-medium capitalize">{disbursementData.lender_proof_method?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-medium">{disbursementData.lender_proof_date ? format(new Date(disbursementData.lender_proof_date), 'MMM dd, yyyy') : 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reference:</span>
                      <p className="font-medium font-mono">{disbursementData.lender_proof_reference || 'N/A'}</p>
                    </div>
                  </div>
                  {disbursementData.lender_proof_url && (
                    <a
                      href={disbursementData.lender_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"
                    >
                      <Download className="h-3 w-3" />
                      View Proof
                    </a>
                  )}
                </div>

                {disbursementData.borrower_disputed && (
                  <div className="space-y-4">
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-900">
                        <strong>Borrower says they haven&apos;t received the money!</strong><br />
                        <span className="text-sm">Reason: {disbursementData.borrower_dispute_reason || 'Not specified'}</span>
                        <p className="text-sm mt-2 text-red-700">
                          Disputed on: {disbursementData.borrower_disputed_at ? format(new Date(disbursementData.borrower_disputed_at), 'MMM d, yyyy HH:mm') : 'Unknown'}
                        </p>
                      </AlertDescription>
                    </Alert>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="font-semibold text-amber-900 mb-2">What you can do:</h4>
                      <ul className="text-sm text-amber-800 space-y-1 mb-4">
                        <li>• Double-check that you sent to the correct account/number</li>
                        <li>• Verify the transaction was successful on your end</li>
                        <li>• Contact the borrower directly via Messages to resolve</li>
                        <li>• Upload new/updated proof if needed</li>
                      </ul>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setDisbursementDialog(true)}
                          className="flex-1"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload New Proof
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => router.push('/l/messages')}
                          className="flex-1"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Message Borrower
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Lender needs to submit proof
              <div className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Please send <strong>{formatCurrency(loan.principal_minor || 0, loan.country_code)}</strong> to {loan.borrowers?.full_name} and then upload proof of payment (bank transfer receipt, mobile money screenshot, etc.)
                  </AlertDescription>
                </Alert>

                <Button onClick={() => setDisbursementDialog(true)} className="w-full" size="lg">
                  <Send className="h-4 w-4 mr-2" />
                  Upload Proof of Payment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Repayment Progress Visualization - Only show for tracked loans */}
      {['active', 'completed', 'defaulted', 'written_off'].includes(loan.status) && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Repayment Progress
          </CardTitle>
          <CardDescription>Visual overview of loan completion and payment health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Circular Progress Chart */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative w-full max-w-[300px] aspect-square">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    barSize={40}
                    data={getRadialChartData()}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={10}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {getPaymentAnalytics().progressPercentage}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Complete</div>
                  <div className="mt-3 flex items-center gap-1">
                    <Award className={`h-5 w-5 ${
                      getPaymentAnalytics().paymentHealthScore >= 80 ? 'text-green-600' :
                      getPaymentAnalytics().paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                    <span className={`text-sm font-semibold ${
                      getPaymentAnalytics().paymentHealthScore >= 80 ? 'text-green-600' :
                      getPaymentAnalytics().paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {getPaymentAnalytics().paymentHealthScore}% Health
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Statistics */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Payment Statistics</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                      <span className="text-sm">On-Time Payments</span>
                    </div>
                    <span className="font-semibold">
                      {getPaymentAnalytics().onTimePayments} / {getPaymentAnalytics().paidPayments}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <span className="text-sm">Late Payments</span>
                    </div>
                    <span className="font-semibold">{getPaymentAnalytics().latePayments}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-blue-500" />
                      <span className="text-sm">Pending Payments</span>
                    </div>
                    <span className="font-semibold">{getPaymentAnalytics().pendingPayments}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <span className="text-sm">Overdue Payments</span>
                    </div>
                    <span className="font-semibold">{getPaymentAnalytics().overduePayments}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Payments Made</span>
                  <span className="text-sm font-semibold">
                    {getPaymentAnalytics().paidPayments} / {getPaymentAnalytics().totalPayments}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      getPaymentAnalytics().paymentHealthScore >= 80 ? 'bg-green-600' :
                      getPaymentAnalytics().paymentHealthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'
                    }`}
                    style={{ width: `${getPaymentAnalytics().progressPercentage}%` }}
                  />
                </div>
              </div>

              {getPaymentAnalytics().paymentHealthScore >= 80 && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-900">
                    Excellent payment record! Borrower is maintaining on-time payments.
                  </AlertDescription>
                </Alert>
              )}

              {getPaymentAnalytics().paymentHealthScore >= 60 && getPaymentAnalytics().paymentHealthScore < 80 && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm text-yellow-900">
                    Good payment record with some delays. Monitor upcoming payments.
                  </AlertDescription>
                </Alert>
              )}

              {getPaymentAnalytics().paymentHealthScore < 60 && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-sm text-red-900">
                    Payment issues detected. Consider reaching out to borrower.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Late Fees Section - Only show for active/overdue loans */}
      {['active', 'defaulted'].includes(loan.status) && (
        <Card className="border-2 border-orange-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Late Payment Fees
                </CardTitle>
                <CardDescription>
                  Manage late fees for overdue payments
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={handleCalculateLateFees}
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Calculate Fees
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Late Fee Summary */}
            {lateFeeSummary && lateFeeSummary.fee_count > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-xs text-orange-700">Total Fees</p>
                  <p className="text-lg font-bold text-orange-900">
                    {formatCurrency(lateFeeSummary.total_fees_minor || 0, loan.country_code)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-700">Paid</p>
                  <p className="text-lg font-bold text-green-900">
                    {formatCurrency(lateFeeSummary.paid_fees_minor || 0, loan.country_code)}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-700">Pending</p>
                  <p className="text-lg font-bold text-red-900">
                    {formatCurrency(lateFeeSummary.pending_fees_minor || 0, loan.country_code)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-700">Waived</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(lateFeeSummary.waived_fees_minor || 0, loan.country_code)}
                  </p>
                </div>
              </div>
            )}

            {/* Late Fees List */}
            {lateFees.length > 0 ? (
              <div className="space-y-3">
                {lateFees.map((fee) => (
                  <div
                    key={fee.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      fee.status === 'paid' ? 'bg-green-50 border-green-200' :
                      fee.status === 'waived' ? 'bg-gray-50 border-gray-200' :
                      'bg-orange-50 border-orange-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        fee.status === 'paid' ? 'bg-green-100' :
                        fee.status === 'waived' ? 'bg-gray-100' :
                        'bg-orange-100'
                      }`}>
                        <Percent className={`h-5 w-5 ${
                          fee.status === 'paid' ? 'text-green-600' :
                          fee.status === 'waived' ? 'text-gray-600' :
                          'text-orange-600'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium">
                          {formatCurrency(fee.fee_amount_minor || 0, loan.country_code)}
                          <span className="text-sm text-muted-foreground ml-2">
                            ({fee.fee_percentage}% - Tier {fee.tier_applied})
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {fee.days_overdue} days overdue • Applied {format(new Date(fee.created_at), 'MMM dd, yyyy')}
                        </p>
                        {fee.waiver_reason && (
                          <p className="text-xs text-gray-500 mt-1">Waiver reason: {fee.waiver_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        fee.status === 'paid' ? 'default' :
                        fee.status === 'waived' ? 'secondary' :
                        'destructive'
                      }>
                        {fee.status}
                      </Badge>
                      {fee.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleWaiveLateFee(fee.id)}
                          disabled={waivingFee === fee.id}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                        >
                          {waivingFee === fee.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Waive'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No late fees have been applied to this loan</p>
                <p className="text-sm mt-1">Late fees are automatically calculated for overdue payments</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loan Restructuring Section */}
      {loan.status === 'active' && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                  Loan Restructuring
                </CardTitle>
                <CardDescription>
                  Modify loan terms if the borrower is struggling
                </CardDescription>
              </div>
              {!pendingRestructure && (
                <Button
                  variant="outline"
                  onClick={() => setRestructureDialog(true)}
                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <HandCoins className="h-4 w-4 mr-2" />
                  Propose Restructure
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {pendingRestructure ? (
              <div className="space-y-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900">
                    <strong>Pending Restructure Request</strong>
                    <p className="text-sm mt-1">
                      {pendingRestructure.requested_by_role === 'borrower'
                        ? 'The borrower has requested to restructure this loan. Please review:'
                        : 'You have requested a restructure. Waiting for borrower approval.'}
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600">Current Term</p>
                    <p className="text-lg font-bold">{pendingRestructure.original_term_months} months</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600">Proposed Term</p>
                    <p className="text-lg font-bold text-blue-900">{pendingRestructure.new_term_months} months</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-600">Current Rate</p>
                    <p className="text-lg font-bold">{pendingRestructure.original_interest_rate}%</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600">Proposed Rate</p>
                    <p className="text-lg font-bold text-blue-900">{pendingRestructure.new_interest_rate}%</p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium">Reason: <span className="capitalize">{pendingRestructure.reason?.replace('_', ' ')}</span></p>
                  {pendingRestructure.reason_details && (
                    <p className="text-sm text-muted-foreground mt-1">{pendingRestructure.reason_details}</p>
                  )}
                </div>

                {pendingRestructure.requested_by_role === 'borrower' && (
                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleRespondToRestructure(true)}
                      disabled={respondingToRestructure}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {respondingToRestructure ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleRespondToRestructure(false)}
                      disabled={respondingToRestructure}
                      className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No active restructure requests</p>
                <p className="text-sm mt-1">
                  You can propose new terms if the borrower is having difficulty repaying
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Borrower & Loan Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Borrower Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{loan.borrowers?.full_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{loan.borrowers?.phone_e164}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span>Credit Score: <strong>{loan.borrowers?.borrower_scores?.[0]?.score || 'N/A'}</strong></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interest Rate:</span>
              <span className="font-medium">{((loan.apr_bps || 0) / 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Term:</span>
              <span className="font-medium">{loan.term_months} months</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Disbursed:</span>
              <span className="font-medium">{loan.disbursement_date ? format(new Date(loan.disbursement_date), 'MMM dd, yyyy') : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress:</span>
              <span className="font-medium">{calculateProgress()}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Proofs from Borrower */}
      {paymentProofs.length > 0 && (
        <Card className="border-2 border-yellow-200 bg-yellow-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-yellow-600" />
              Payment Proofs from Borrower
              {paymentProofs.filter(p => p.status === 'pending').length > 0 && (
                <Badge className="bg-yellow-600 ml-2">
                  {paymentProofs.filter(p => p.status === 'pending').length} Pending
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review and confirm payments submitted by your borrower. Failure to respond promptly may affect your lender score.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentProofs.map((proof) => (
              <div
                key={proof.id}
                className={`p-4 rounded-lg border ${
                  proof.status === 'approved' ? 'bg-green-50 border-green-200' :
                  proof.status === 'rejected' ? 'bg-red-50 border-red-200' :
                  'bg-white border-yellow-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold">
                        {formatCurrency((proof.amount || proof.amount_claimed || 0) * 100)}
                      </span>
                      <Badge className={
                        proof.status === 'approved' ? 'bg-green-600' :
                        proof.status === 'rejected' ? 'bg-red-600' :
                        'bg-yellow-600'
                      }>
                        {proof.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {proof.status === 'rejected' && <X className="h-3 w-3 mr-1" />}
                        {proof.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                        {proof.status.charAt(0).toUpperCase() + proof.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Payment Date</p>
                        <p className="font-medium">{format(new Date(proof.payment_date), 'MMM d, yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Method</p>
                        <p className="font-medium capitalize">{proof.payment_method?.replace('_', ' ')}</p>
                      </div>
                      {proof.reference_number && (
                        <div>
                          <p className="text-gray-500">Reference</p>
                          <p className="font-medium">{proof.reference_number}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-500">Submitted</p>
                        <p className="font-medium">{format(new Date(proof.created_at), 'MMM d, HH:mm')}</p>
                      </div>
                    </div>
                    {proof.notes && (
                      <p className="text-sm text-gray-600 italic">"{proof.notes}"</p>
                    )}
                    {proof.status === 'rejected' && proof.rejection_reason && (
                      <p className="text-sm text-red-600">
                        <strong>Rejection reason:</strong> {proof.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <a
                      href={proof.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                    >
                      <Eye className="h-4 w-4" />
                      View Proof
                    </a>
                    {proof.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprovePaymentProof(proof.id)}
                          disabled={processingProofReview}
                        >
                          {processingProofReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => setReviewingProof(proof)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Reject Payment Proof Dialog */}
      <Dialog open={!!reviewingProof} onOpenChange={() => { setReviewingProof(null); setRejectReason(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Proof</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment proof. The borrower will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewingProof && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p><strong>Amount claimed:</strong> {formatCurrency((reviewingProof.amount || reviewingProof.amount_claimed || 0) * 100)}</p>
                <p><strong>Payment date:</strong> {format(new Date(reviewingProof.payment_date), 'MMM d, yyyy')}</p>
                <a href={reviewingProof.proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  View submitted proof
                </a>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason for rejection *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., The receipt doesn't match the claimed amount, or the transaction reference is invalid..."
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setReviewingProof(null); setRejectReason(''); }}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={() => reviewingProof && handleRejectPaymentProof(reviewingProof.id)}
                disabled={processingProofReview || !rejectReason.trim()}
              >
                {processingProofReview ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reject Proof
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Repayment Schedule - Only show for tracked loans */}
      {['active', 'completed', 'defaulted', 'written_off'].includes(loan.status) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Repayment Schedule</CardTitle>
              <CardDescription>Track and mark payments as they come in</CardDescription>
            </div>
            {loan.status === 'active' && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSetupDeductionOpen(true)}
                  className="border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Landmark className="h-4 w-4 mr-2" />
                  Setup Auto Deductions
                </Button>
                <Button
                  variant="outline"
                  onClick={handleShowEarlyPayoff}
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  <Banknote className="h-4 w-4 mr-2" />
                  Pay Off Entire Loan
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Installment</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount Due</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loan.repayment_schedules?.map((schedule: any) => {
                    const status = getScheduleStatus(schedule)
                    const isOverdue = status === 'overdue'

                    return (
                      <TableRow key={schedule.id} className={isOverdue ? 'bg-red-50' : ''}>
                        <TableCell className="font-medium">#{schedule.installment_no}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(schedule.due_date), 'MMM dd, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(schedule.amount_due_minor || 0, loan.country_code)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(schedule.principal_minor || 0, loan.country_code)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(schedule.interest_minor || 0, loan.country_code)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(status)}
                            {schedule.is_early_payment && status === 'paid' && (
                              <Badge className="bg-blue-100 text-blue-800 text-xs">
                                Early
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {status !== 'paid' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkAsPaid(schedule)}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Mark as Paid
                              </Button>
                            )}
                            {isOverdue && status !== 'paid' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                                onClick={() => {
                                  setEditingScheduleNotes(schedule)
                                  setScheduleNotes(schedule.lender_notes || '')
                                }}
                              >
                                <FileEdit className="h-3 w-3 mr-1" />
                                {schedule.lender_notes ? 'Edit Notes' : 'Add Notes'}
                              </Button>
                            )}
                            {status === 'paid' && (schedule.paid_at || getSchedulePaidAt(schedule)) && (
                              <span className="text-sm text-muted-foreground">
                                Paid {format(new Date(schedule.paid_at || getSchedulePaidAt(schedule)), 'MMM dd')}
                              </span>
                            )}
                          </div>
                          {schedule.lender_notes && (
                            <p className="text-xs text-orange-700 mt-1 max-w-xs truncate" title={schedule.lender_notes}>
                              Note: {schedule.lender_notes}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History - Only show for tracked loans */}
      {['active', 'completed', 'defaulted', 'written_off'].includes(loan.status) && getAllRepaymentEvents().length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Recent payments received</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {getAllRepaymentEvents().map((event: any) => (
                <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {formatCurrency(event.amount_paid_minor || 0, loan.country_code)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(event.paid_at || event.created_at), 'MMM dd, yyyy')}
                        {event.installment_no && ` • Installment #${event.installment_no}`}
                      </p>
                      {event.method && (
                        <p className="text-xs text-muted-foreground mt-1 capitalize">
                          via {event.method.replace('_', ' ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {format(new Date(event.created_at), 'MMM dd, HH:mm')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Mark installment #{selectedSchedule?.installment_no} as paid
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount Paid ({loan.currency})</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentData.amountPaid}
                onChange={(e) => setPaymentData({...paymentData, amountPaid: e.target.value})}
                placeholder="0.00"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Amount due: {formatCurrency(selectedSchedule?.amount_due_minor || 0, loan.country_code)}
              </p>
            </div>

            <div>
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentData.paymentDate}
                onChange={(e) => setPaymentData({...paymentData, paymentDate: e.target.value})}
              />
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={paymentData.notes}
                onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
                placeholder="Add any notes about this payment..."
                rows={3}
              />
            </div>

            {parseFloat(paymentData.amountPaid) < (selectedSchedule?.amount_due_minor || 0) / 100 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This is a partial payment. The installment will be marked as partially paid.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={processingPayment || !paymentData.amountPaid}>
              {processingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Record Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Early Payoff Dialog */}
      <Dialog open={earlyPayoffDialog} onOpenChange={setEarlyPayoffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay Off Entire Loan Early</DialogTitle>
            <DialogDescription>
              Record a full payoff for this loan. This will mark all remaining installments as paid.
            </DialogDescription>
          </DialogHeader>

          {earlyPayoffInfo && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900">
                  <strong>Early Payoff Benefits:</strong> Paying off the loan early gives the borrower a credit score boost!
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Total Loan Amount</p>
                  <p className="text-xl font-bold">
                    {earlyPayoffInfo.currency_symbol}{earlyPayoffInfo.total_due?.toLocaleString()}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-700">Already Paid</p>
                  <p className="text-xl font-bold text-green-600">
                    {earlyPayoffInfo.currency_symbol}{earlyPayoffInfo.total_paid?.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 text-center">
                <p className="text-sm text-blue-700 mb-1">Amount to Pay Off</p>
                <p className="text-3xl font-bold text-blue-900">
                  {earlyPayoffInfo.currency_symbol}{earlyPayoffInfo.remaining_balance?.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEarlyPayoffDialog(false)
                setEarlyPayoffInfo(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProcessEarlyPayoff}
              disabled={processingEarlyPayoff || !earlyPayoffInfo?.remaining_balance}
              className="bg-green-600 hover:bg-green-700"
            >
              {processingEarlyPayoff ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Full Payoff
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof of Payment Dialog */}
      <Dialog open={disbursementDialog} onOpenChange={setDisbursementDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Proof of Payment</DialogTitle>
            <DialogDescription>
              Upload your bank receipt or mobile money screenshot showing you sent money to {loan?.borrowers?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount Sent *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={disbursementForm.amount}
                  onChange={(e) => setDisbursementForm({...disbursementForm, amount: e.target.value})}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Loan amount: {formatCurrency(loan?.principal_minor || 0, loan?.country_code)}
                </p>
              </div>
              <div>
                <Label>How did you send it? *</Label>
                <Select
                  value={disbursementForm.method}
                  onValueChange={(value) => setDisbursementForm({...disbursementForm, method: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Transaction Reference / Receipt Number</Label>
              <Input
                value={disbursementForm.reference}
                onChange={(e) => setDisbursementForm({...disbursementForm, reference: e.target.value})}
                placeholder="e.g., TXN123456, MPESA code, etc."
              />
            </div>

            <div>
              <Label>Upload Proof (Bank Receipt / Screenshot) *</Label>
              <div className="mt-1">
                <input
                  ref={disbursementFileRef}
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      if (file.size > 25 * 1024 * 1024) {
                        toast.error('File size must be less than 25MB')
                        e.target.value = ''
                        return
                      }
                      setDisbursementFile(file)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-2 h-20"
                  onClick={() => disbursementFileRef.current?.click()}
                >
                  {disbursementFile ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-sm">{disbursementFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm">Click to upload bank receipt or screenshot</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={disbursementForm.notes}
                onChange={(e) => setDisbursementForm({...disbursementForm, notes: e.target.value})}
                placeholder="Any additional details about the payment..."
                rows={2}
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                After you upload this proof, the borrower will be asked to confirm they received the money.
                The loan will become active once they confirm receipt.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbursementDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDisbursement}
              disabled={submittingDisbursement || !disbursementForm.amount}
            >
              {submittingDisbursement ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Proof
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restructure Dialog */}
      <Dialog open={restructureDialog} onOpenChange={setRestructureDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propose Loan Restructure</DialogTitle>
            <DialogDescription>
              Propose new terms for this loan. The borrower will need to approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium">Current Terms</p>
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Term:</span>
                  <span className="ml-2 font-medium">{loan?.term_months} months</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rate:</span>
                  <span className="ml-2 font-medium">{((loan?.apr_bps || 0) / 100).toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>New Term (months) *</Label>
                <Input
                  type="number"
                  value={restructureForm.newTermMonths}
                  onChange={(e) => setRestructureForm({...restructureForm, newTermMonths: e.target.value})}
                  placeholder="12"
                  min="1"
                />
              </div>
              <div>
                <Label>New Interest Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={restructureForm.newInterestRate}
                  onChange={(e) => setRestructureForm({...restructureForm, newInterestRate: e.target.value})}
                  placeholder="10"
                />
              </div>
            </div>

            <div>
              <Label>Reason for Restructuring *</Label>
              <Select
                value={restructureForm.reason}
                onValueChange={(value) => setRestructureForm({...restructureForm, reason: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial_hardship">Financial Hardship</SelectItem>
                  <SelectItem value="income_change">Income Change</SelectItem>
                  <SelectItem value="medical_emergency">Medical Emergency</SelectItem>
                  <SelectItem value="job_loss">Job Loss</SelectItem>
                  <SelectItem value="business_downturn">Business Downturn</SelectItem>
                  <SelectItem value="rate_adjustment">Rate Adjustment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Additional Details (Optional)</Label>
              <Textarea
                value={restructureForm.reasonDetails}
                onChange={(e) => setRestructureForm({...restructureForm, reasonDetails: e.target.value})}
                placeholder="Provide more context about the restructuring request..."
                rows={3}
              />
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900 text-sm">
                The borrower will receive a notification and must approve before changes take effect.
                A new repayment schedule will be generated automatically.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestructureDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestRestructure}
              disabled={submittingRestructure || !restructureForm.newTermMonths || !restructureForm.reason}
            >
              {submittingRestructure ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Send Proposal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lender Notes Dialog for Overdue Payments */}
      <Dialog open={!!editingScheduleNotes} onOpenChange={() => { setEditingScheduleNotes(null); setScheduleNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why Hasn't This Payment Been Updated?</DialogTitle>
            <DialogDescription>
              Please explain why this overdue payment hasn't been marked as paid. This note will be visible to the borrower and may be reviewed in case of a dispute.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingScheduleNotes && (
              <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm">
                <p><strong>Installment:</strong> #{editingScheduleNotes.installment_no}</p>
                <p><strong>Amount Due:</strong> {formatCurrency(editingScheduleNotes.amount_due_minor || 0, loan?.country_code)}</p>
                <p><strong>Due Date:</strong> {format(new Date(editingScheduleNotes.due_date), 'MMM d, yyyy')}</p>
                <p className="text-red-600 font-medium">
                  {differenceInDays(new Date(), new Date(editingScheduleNotes.due_date))} days overdue
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="e.g., Borrower claims they paid but no proof received yet, Borrower requested extension, Investigating disputed payment, etc."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Be specific about why this payment hasn't been recorded. This helps in case of disputes.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setEditingScheduleNotes(null); setScheduleNotes(''); }}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveScheduleNotes}
                disabled={savingNotes || !scheduleNotes.trim()}
              >
                {savingNotes ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Notes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Setup Auto Deductions Dialog */}
      {loan && (
        <SetupDeductionDialog
          open={setupDeductionOpen}
          onOpenChange={setSetupDeductionOpen}
          loanId={loan.id}
          loanAmount={loan.principal_minor ? loan.principal_minor / 100 : loan.amount || 0}
          outstandingBalance={loan.outstanding_balance || 0}
          currency={loan.currency || 'NAD'}
          borrowerName={loan.borrowers?.full_name || 'Unknown'}
          onSuccess={() => {
            // Refresh loan data
            loadLoanDetails()
          }}
        />
      )}
    </div>
  )
}
