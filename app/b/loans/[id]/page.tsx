'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
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
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Loader2,
  Download,
  Upload,
  Send,
  Wallet,
  XCircle,
  Eye,
  Calculator,
  Receipt,
  Camera,
  DollarSign,
  CreditCard,
  Banknote,
  Phone,
  Building
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format, differenceInDays, isPast } from 'date-fns'
import { getCurrencyInfo, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export default function BorrowerLoanDetailPage() {
  const [loan, setLoan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [agreementData, setAgreementData] = useState<any>(null)
  const [disbursementData, setDisbursementData] = useState<any>(null)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)
  const [signedAgreementFile, setSignedAgreementFile] = useState<File | null>(null)
  const [uploadingSignedAgreement, setUploadingSignedAgreement] = useState(false)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)
  const [disputeDialog, setDisputeDialog] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Payment proof states
  const [paymentProofs, setPaymentProofs] = useState<any[]>([])
  const [showPaymentProofDialog, setShowPaymentProofDialog] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofAmount, setProofAmount] = useState('')
  const [proofDate, setProofDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [proofMethod, setProofMethod] = useState('')
  const [proofReference, setProofReference] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [submittingProof, setSubmittingProof] = useState(false)
  const proofFileInputRef = useRef<HTMLInputElement>(null)

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

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      const { data: linkData } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      if (!linkData) {
        router.push('/b/loans')
        return
      }

      const { data: loanData, error } = await supabase
        .from('loans')
        .select(`
          *,
          lenders(business_name, email),
          repayment_schedules(id, installment_no, due_date, amount_due_minor, status, paid_at)
        `)
        .eq('id', loanId)
        .eq('borrower_id', linkData.borrower_id)
        .single()

      if (error || !loanData) {
        router.push('/b/loans')
        return
      }

      if (loanData.repayment_schedules) {
        loanData.repayment_schedules.sort((a: any, b: any) => a.installment_no - b.installment_no)
      }

      setLoan(loanData)

      const { data: agreement } = await supabase
        .from('loan_agreements')
        .select('*')
        .eq('loan_id', loanId)
        .maybeSingle()
      setAgreementData(agreement)

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
    } catch (error) {
      console.error('Error loading loan:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadAgreement = async () => {
    try {
      setDownloadingAgreement(true)
      const response = await fetch(`/api/loans/agreement?loanId=${loanId}`)
      if (!response.ok) throw new Error('Failed to download agreement')

      const htmlContent = await response.text()
      const container = document.createElement('div')
      container.innerHTML = htmlContent
      container.style.cssText = 'position:absolute;left:-9999px;width:800px;padding:40px;background:white'
      document.body.appendChild(container)

      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      document.body.removeChild(container)

      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210, pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight, position = 0

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setTextColor(200, 200, 200)
        pdf.setFontSize(60)
        pdf.text('CREDLIO', imgWidth / 2, pageHeight / 2, { angle: 45, align: 'center' })
        pdf.setFontSize(10)
        pdf.setTextColor(150, 150, 150)
        pdf.text('Powered by Credlio', imgWidth / 2, pageHeight - 10, { align: 'center' })
      }
      pdf.save(`loan-agreement-${loanId}.pdf`)
    } catch (error: any) {
      alert(error.message || 'Failed to download')
    } finally {
      setDownloadingAgreement(false)
    }
  }

  const handleUploadSignedAgreement = async () => {
    if (!signedAgreementFile || !agreementData) return alert('Please select a file')
    try {
      setUploadingSignedAgreement(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return alert('Please sign in')

      const arrayBuffer = await signedAgreementFile.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const signedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      const filePath = `signed-agreements/${user.id}/loan-${loanId}/borrower-signed-${Date.now()}.${signedAgreementFile.name.split('.').pop()}`
      const { error: uploadError } = await supabase.storage.from('evidence').upload(filePath, signedAgreementFile)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(filePath)
      const { error: dbError } = await supabase.rpc('upload_borrower_signed_agreement', {
        p_agreement_id: agreementData.id, p_signed_url: publicUrl, p_signed_hash: signedHash
      })
      if (dbError) throw dbError

      alert('Signed agreement uploaded!')
      setSignedAgreementFile(null)
      loadLoanDetails()
    } catch (error: any) {
      alert(error.message || 'Upload failed')
    } finally {
      setUploadingSignedAgreement(false)
    }
  }

  const handleConfirmReceipt = async () => {
    if (!loan) return
    try {
      setConfirmingReceipt(true)
      const { error } = await supabase.rpc('confirm_disbursement_receipt', { p_loan_id: loan.id, p_notes: null })
      if (error) throw error
      alert('Funds confirmed! Loan is now active.')
      loadLoanDetails()
    } catch (error: any) {
      alert(error.message || 'Failed to confirm')
    } finally {
      setConfirmingReceipt(false)
    }
  }

  const handleDisputeDisbursement = async () => {
    if (!loan || !disputeReason.trim()) return alert('Please provide a reason')
    try {
      setSubmittingDispute(true)
      const { error } = await supabase.rpc('dispute_disbursement', { p_loan_id: loan.id, p_reason: disputeReason })
      if (error) throw error
      alert('Dispute submitted.')
      setDisputeDialog(false)
      setDisputeReason('')
      loadLoanDetails()
    } catch (error: any) {
      alert(error.message || 'Failed to dispute')
    } finally {
      setSubmittingDispute(false)
    }
  }

  const handleSubmitPaymentProof = async () => {
    if (!proofFile || !proofAmount || !proofMethod || !proofDate) {
      return alert('Please fill in all required fields and upload proof')
    }
    try {
      setSubmittingProof(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return alert('Please sign in')

      // Upload proof file
      const fileExt = proofFile.name.split('.').pop()
      const filePath = `payment-proofs/${user.id}/${loanId}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, proofFile)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('payment-proofs').getPublicUrl(filePath)

      // Submit payment proof
      const { error } = await supabase.rpc('submit_payment_proof', {
        p_loan_id: loanId,
        p_amount: parseFloat(proofAmount),
        p_payment_date: proofDate,
        p_payment_method: proofMethod,
        p_reference_number: proofReference || null,
        p_proof_url: publicUrl,
        p_notes: proofNotes || null
      })
      if (error) throw error

      alert('Payment proof submitted! The lender will review and confirm.')
      setShowPaymentProofDialog(false)
      setProofFile(null)
      setProofAmount('')
      setProofMethod('')
      setProofReference('')
      setProofNotes('')
      loadLoanDetails()
    } catch (error: any) {
      alert(error.message || 'Failed to submit payment proof')
    } finally {
      setSubmittingProof(false)
    }
  }

  const formatCurrency = (amountMinor: number, currencyCode?: string) => {
    if (currencyCode) {
      const currency = getCurrencyInfo(currencyCode)
      if (currency) return formatCurrencyUtil(amountMinor, currency)
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amountMinor / 100)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending_signatures: 'bg-purple-100 text-purple-800',
      pending_disbursement: 'bg-orange-100 text-orange-800',
      completed: 'bg-blue-100 text-blue-800',
      defaulted: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_signatures: 'Awaiting Signatures',
      pending_disbursement: 'Awaiting Funds'
    }
    return labels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')
  }

  const calculateProgress = () => {
    if (!loan) return 0
    // total_amount_minor is in cents, total_repaid is in major units (dollars)
    const totalMinor = loan.total_amount_minor || loan.total_minor || 0
    const repaidMinor = (loan.total_repaid || 0) * 100  // Convert to cents
    return totalMinor > 0 ? Math.round((repaidMinor / totalMinor) * 100) : 0
  }

  const getNextPayment = () => {
    if (!loan?.repayment_schedules) return null
    return loan.repayment_schedules.filter((s: any) => s.status === 'pending').sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>

  if (!loan) return (
    <div className="flex flex-col items-center justify-center h-96 space-y-4">
      <AlertTriangle className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-2xl font-semibold">Loan not found</h2>
      <Button onClick={() => router.push('/b/loans')}><ArrowLeft className="h-4 w-4 mr-2" />Back to Loans</Button>
    </div>
  )

  const nextPayment = getNextPayment()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/b/loans')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <div>
            <h1 className="text-3xl font-bold">Loan Details</h1>
            <p className="text-muted-foreground">#{loan.id.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleDownloadAgreement} disabled={downloadingAgreement}>
            {downloadingAgreement ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating...</> : <><Download className="h-4 w-4 mr-2" />Download PDF</>}
          </Button>
          <Badge className={getStatusColor(loan.status)}>{getStatusLabel(loan.status)}</Badge>
        </div>
      </div>

      {/* Loan Breakdown */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-600" />Loan Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-sm text-gray-600">Principal</p><p className="text-xl font-bold">{formatCurrency(loan.principal_minor || 0, loan.currency)}</p></div>
            <div><p className="text-sm text-gray-600">Interest Rate</p><p className="text-xl font-bold text-orange-600">{loan.total_interest_percent || loan.base_rate_percent || 0}%</p></div>
            <div><p className="text-sm text-gray-600">Interest Amount</p><p className="text-xl font-bold text-orange-600">{formatCurrency(loan.interest_amount_minor || 0, loan.currency)}</p></div>
            <div className="bg-blue-100 rounded-lg p-3"><p className="text-sm text-blue-700">Total to Pay</p><p className="text-xl font-bold text-blue-900">{formatCurrency(loan.total_amount_minor || 0, loan.currency)}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Total Due</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(loan.total_amount_minor || 0, loan.currency)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Total Repaid</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{formatCurrency((loan.total_repaid || 0) * 100, loan.currency)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Remaining</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-orange-600">{formatCurrency((loan.total_amount_minor || 0) - (loan.total_repaid || 0) * 100, loan.currency)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-600">Progress</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{calculateProgress()}%</p><Progress value={calculateProgress()} className="h-2 mt-2" /></CardContent></Card>
      </div>

      {/* Agreement Signatures */}
      {agreementData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Loan Agreement Signatures</CardTitle>
            <CardDescription>Both parties must upload their signed copy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Borrower */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Your Signature</h3>
                  <Badge className={agreementData.borrower_signed_at ? 'bg-green-600' : ''}>{agreementData.borrower_signed_at ? <><CheckCircle className="h-3 w-3 mr-1" />Signed</> : <><Clock className="h-3 w-3 mr-1" />Pending</>}</Badge>
                </div>
                {agreementData.borrower_signed_at ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-900"><strong>Signed:</strong> {format(new Date(agreementData.borrower_signed_at), 'MMM d, yyyy HH:mm')}</p>
                    {agreementData.borrower_signed_url && <a href={agreementData.borrower_signed_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"><Download className="h-3 w-3" />View</a>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Alert><AlertDescription className="text-sm">Download, sign, and upload your signed agreement</AlertDescription></Alert>
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size <= 25*1024*1024) setSignedAgreementFile(f); else if (f) alert('Max 25MB') }} />
                    <Button variant="outline" className="w-full border-dashed border-2 h-16" onClick={() => fileInputRef.current?.click()}>
                      <div className="flex flex-col items-center"><FileText className="h-5 w-5 text-blue-600" /><span className="text-sm">Select file</span></div>
                    </Button>
                    {signedAgreementFile && <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-sm flex-1">{signedAgreementFile.name}</span><Button variant="ghost" size="sm" onClick={() => { setSignedAgreementFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>Remove</Button></div>}
                    <Button onClick={handleUploadSignedAgreement} disabled={!signedAgreementFile || uploadingSignedAgreement} className="w-full">{uploadingSignedAgreement ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading...</> : <><Upload className="h-4 w-4 mr-2" />Upload</>}</Button>
                  </div>
                )}
              </div>
              {/* Lender */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Lender's Signature</h3>
                  <Badge className={agreementData.lender_signed_at ? 'bg-green-600' : ''}>{agreementData.lender_signed_at ? <><CheckCircle className="h-3 w-3 mr-1" />Signed</> : <><Clock className="h-3 w-3 mr-1" />Pending</>}</Badge>
                </div>
                {agreementData.lender_signed_at ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-900"><strong>Signed:</strong> {format(new Date(agreementData.lender_signed_at), 'MMM d, yyyy HH:mm')}</p>
                    {agreementData.lender_signed_url && <a href={agreementData.lender_signed_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"><Download className="h-3 w-3" />View</a>}
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><p className="text-sm text-gray-600">Waiting for lender...</p></div>
                )}
              </div>
            </div>
            {agreementData.fully_signed && <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-lg p-4"><div className="flex items-center gap-2 text-green-900"><CheckCircle className="h-5 w-5" /><strong>Agreement Fully Executed</strong></div></div>}
          </CardContent>
        </Card>
      )}

      {/* Confirm Money Received */}
      {loan.status === 'pending_disbursement' && (
        <Card className="border-2 border-orange-300 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900"><Wallet className="h-5 w-5" />Confirm You Received the Money</CardTitle>
            <CardDescription>Your lender says they sent you money. Check your bank account or mobile money and confirm below once you receive it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {disbursementData?.lender_submitted_at ? (
              <>
                <Alert className="bg-blue-50 border-blue-200">
                  <Send className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-900">Lender Says Money Was Sent</AlertTitle>
                  <AlertDescription className="text-blue-800">They uploaded proof of payment on {format(new Date(disbursementData.lender_submitted_at), 'MMM d, yyyy HH:mm')}</AlertDescription>
                </Alert>
                <div className="bg-white rounded-lg p-4 border space-y-2">
                  <h4 className="font-semibold">Payment Details from Lender</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-gray-600">Amount Sent</p><p className="font-bold text-lg">{formatCurrency((disbursementData.lender_proof_amount || 0) * 100, loan.currency)}</p></div>
                    <div><p className="text-gray-600">How They Sent It</p><p className="font-medium capitalize">{disbursementData.lender_proof_method?.replace('_', ' ') || 'N/A'}</p></div>
                    {disbursementData.lender_proof_reference && <div><p className="text-gray-600">Transaction Reference</p><p className="font-medium">{disbursementData.lender_proof_reference}</p></div>}
                  </div>
                  {disbursementData.lender_proof_url && <a href={disbursementData.lender_proof_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><Eye className="h-3 w-3" />View Their Proof of Payment</a>}
                </div>
                {disbursementData.borrower_disputed ? (
                  <Alert className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-900">You Reported Not Receiving Money</AlertTitle><AlertDescription className="text-red-800">Your reason: {disbursementData.borrower_dispute_reason}</AlertDescription></Alert>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={handleConfirmReceipt} disabled={confirmingReceipt} className="flex-1 bg-green-600 hover:bg-green-700">{confirmingReceipt ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Confirming...</> : <><CheckCircle className="h-4 w-4 mr-2" />Yes, I Received the Money</>}</Button>
                    <Dialog open={disputeDialog} onOpenChange={setDisputeDialog}>
                      <DialogTrigger asChild><Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50"><XCircle className="h-4 w-4 mr-2" />I Haven&apos;t Received It</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Report: Money Not Received</DialogTitle><DialogDescription>Let us know why you haven&apos;t received the money. This will notify your lender.</DialogDescription></DialogHeader>
                        <div className="space-y-4">
                          <div><Label>What happened? *</Label><Textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="e.g., I checked my bank/mobile money account but don't see any deposit..." rows={4} /></div>
                          <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setDisputeDialog(false)}>Cancel</Button>
                            <Button onClick={handleDisputeDisbursement} disabled={submittingDispute || !disputeReason.trim()} className="bg-red-600 hover:bg-red-700">{submittingDispute ? 'Submitting...' : 'Report Issue'}</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </>
            ) : (
              <Alert><Clock className="h-4 w-4" /><AlertTitle>Waiting for Lender to Send Money</AlertTitle><AlertDescription>Your lender hasn&apos;t sent the money yet, or hasn&apos;t uploaded their proof of payment. Once they do, you&apos;ll see the details here.</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Next Payment */}
      {nextPayment && loan.status === 'active' && (
        <Alert className={differenceInDays(new Date(nextPayment.due_date), new Date()) < 7 ? 'border-orange-200 bg-orange-50' : ''}>
          <Calendar className="h-4 w-4" />
          <AlertTitle>Next Payment Due</AlertTitle>
          <AlertDescription>
            <p className="font-semibold text-lg mt-1">{formatCurrency(nextPayment.amount_due_minor, loan.currency)}</p>
            <p className="text-sm">Due {format(new Date(nextPayment.due_date), 'MMMM dd, yyyy')} ({differenceInDays(new Date(nextPayment.due_date), new Date())} days)</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Submit Payment Proof - Only for active loans */}
      {loan.status === 'active' && (
        <Card className="border-2 border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <Receipt className="h-5 w-5" />
              Submit Payment Proof
            </CardTitle>
            <CardDescription>
              Made a payment? Upload proof here so your lender can confirm it. This protects you if there's any dispute.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Dialog open={showPaymentProofDialog} onOpenChange={setShowPaymentProofDialog}>
              <DialogTrigger asChild>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Payment Proof
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-green-600" />
                    Submit Payment Proof
                  </DialogTitle>
                  <DialogDescription>
                    Upload a screenshot or photo of your payment receipt. Your lender will verify and record the payment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="proofAmount">Amount Paid *</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="proofAmount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={proofAmount}
                        onChange={(e) => setProofAmount(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <Label htmlFor="proofDate">Payment Date *</Label>
                    <Input
                      id="proofDate"
                      type="date"
                      value={proofDate}
                      onChange={(e) => setProofDate(e.target.value)}
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-2">
                    <Label>Payment Method *</Label>
                    <Select value={proofMethod} onValueChange={setProofMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="How did you pay?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mobile_money">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Mobile Money (M-Pesa, etc.)
                          </div>
                        </SelectItem>
                        <SelectItem value="bank_transfer">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            Bank Transfer
                          </div>
                        </SelectItem>
                        <SelectItem value="cash">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-4 w-4" />
                            Cash
                          </div>
                        </SelectItem>
                        <SelectItem value="cheque">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Cheque
                          </div>
                        </SelectItem>
                        <SelectItem value="card">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Card Payment
                          </div>
                        </SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reference Number */}
                  <div className="space-y-2">
                    <Label htmlFor="proofReference">Transaction Reference (Optional)</Label>
                    <Input
                      id="proofReference"
                      placeholder="e.g., MPESA123456"
                      value={proofReference}
                      onChange={(e) => setProofReference(e.target.value)}
                    />
                  </div>

                  {/* File Upload */}
                  <div className="space-y-2">
                    <Label>Payment Proof (Screenshot/Receipt) *</Label>
                    <input
                      ref={proofFileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f && f.size <= 10 * 1024 * 1024) {
                          setProofFile(f)
                        } else if (f) {
                          alert('File too large. Max 10MB.')
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed border-2 h-20"
                      onClick={() => proofFileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Camera className="h-6 w-6 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {proofFile ? proofFile.name : 'Click to upload receipt'}
                        </span>
                      </div>
                    </Button>
                    {proofFile && (
                      <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm flex-1 truncate">{proofFile.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setProofFile(null)
                            if (proofFileInputRef.current) proofFileInputRef.current.value = ''
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="proofNotes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="proofNotes"
                      placeholder="Any additional information..."
                      value={proofNotes}
                      onChange={(e) => setProofNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    onClick={handleSubmitPaymentProof}
                    disabled={submittingProof || !proofFile || !proofAmount || !proofMethod}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {submittingProof ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" />Submit for Verification</>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Show existing payment proofs */}
            {paymentProofs.length > 0 && (
              <div className="space-y-3 mt-4">
                <h4 className="font-semibold text-sm text-gray-700">Your Payment Proofs</h4>
                {paymentProofs.map((proof) => (
                  <div
                    key={proof.id}
                    className={`p-3 rounded-lg border ${
                      proof.status === 'approved' ? 'bg-green-50 border-green-200' :
                      proof.status === 'rejected' ? 'bg-red-50 border-red-200' :
                      'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {formatCurrency((proof.amount || proof.amount_claimed || 0) * 100, loan.currency)}
                          </span>
                          <Badge className={
                            proof.status === 'approved' ? 'bg-green-600' :
                            proof.status === 'rejected' ? 'bg-red-600' :
                            'bg-yellow-600'
                          }>
                            {proof.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                            {proof.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                            {proof.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                            {proof.status.charAt(0).toUpperCase() + proof.status.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600">
                          {proof.payment_method?.replace('_', ' ')} • {format(new Date(proof.payment_date), 'MMM d, yyyy')}
                        </p>
                        {proof.reference_number && (
                          <p className="text-xs text-gray-500">Ref: {proof.reference_number}</p>
                        )}
                        {proof.status === 'rejected' && proof.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1">
                            Rejected: {proof.rejection_reason}
                          </p>
                        )}
                      </div>
                      <a
                        href={proof.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Repayment Schedule */}
      {['active', 'completed'].includes(loan.status) && loan.repayment_schedules?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Repayment Schedule</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due Date</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {loan.repayment_schedules.map((s: any) => {
                  const overdue = s.status !== 'paid' && isPast(new Date(s.due_date))
                  return (
                    <TableRow key={s.id} className={overdue ? 'bg-red-50' : ''}>
                      <TableCell>{s.installment_no}</TableCell>
                      <TableCell>{format(new Date(s.due_date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(s.amount_due_minor, loan.currency)}</TableCell>
                      <TableCell>
                        {s.status === 'paid' ? <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge> : overdue ? <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge> : <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Lender Info */}
      <Card>
        <CardHeader><CardTitle>Lender Information</CardTitle></CardHeader>
        <CardContent>
          <p><strong>Business:</strong> {loan.lenders?.business_name || 'N/A'}</p>
          <p><strong>Contact:</strong> {loan.lenders?.email || 'N/A'}</p>
        </CardContent>
      </Card>
    </div>
  )
}
