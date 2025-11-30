'use client'

import { useState, useEffect } from 'react'
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
  Upload
} from 'lucide-react'
import { format, isPast, differenceInDays } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, Tooltip } from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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

      const { error: uploadError } = await supabase.storage
        .from('evidence')
        .upload(filePath, signedAgreementFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

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

      if (dbError) throw dbError

      toast.success('✅ Signed agreement uploaded successfully!')
      setSignedAgreementFile(null)

      // Reload loan details to get updated agreement status
      loadLoanDetails()
    } catch (error: any) {
      console.error('Error uploading signed agreement:', error)
      toast.error(error.message || 'Failed to upload signed agreement')
    } finally {
      setUploadingSignedAgreement(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedSchedule || !loan) return

    try {
      setProcessingPayment(true)

      const amountMinor = Math.round(parseFloat(paymentData.amountPaid) * 100)

      // Create repayment event
      const { error: eventError } = await supabase
        .from('repayment_events')
        .insert({
          loan_id: loan.id,
          schedule_id: selectedSchedule.id,
          amount_minor: amountMinor,
          payment_date: paymentData.paymentDate,
          notes: paymentData.notes,
        })

      if (eventError) throw eventError

      // Update schedule status
      const { error: scheduleError } = await supabase
        .from('repayment_schedules')
        .update({
          status: amountMinor >= selectedSchedule.amount_due_minor ? 'paid' : 'partial',
          paid_at: amountMinor >= selectedSchedule.amount_due_minor ? new Date().toISOString() : null,
          paid_amount_minor: amountMinor,
        })
        .eq('id', selectedSchedule.id)

      if (scheduleError) throw scheduleError

      // Check if all schedules are paid to update loan status
      const { data: allSchedules } = await supabase
        .from('repayment_schedules')
        .select('id, amount_due_minor, repayment_events(amount_paid_minor)')
        .eq('loan_id', loan.id)

      const allPaid = allSchedules?.every(s => {
        const totalPaid = (s.repayment_events || []).reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
        return totalPaid >= s.amount_due_minor
      })

      if (allPaid) {
        await supabase
          .from('loans')
          .update({ status: 'completed' })
          .eq('id', loan.id)
      }

      // Update borrower credit score
      await supabase.rpc('update_credit_score', {
        p_borrower_id: loan.borrower_id,
        p_event_type: 'payment_made',
        p_amount: amountMinor,
      })

      toast.success('Payment recorded successfully')
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

  // Helper to check if a schedule is paid (has repayment events covering the full amount)
  const isSchedulePaid = (schedule: any) => {
    if (!schedule.repayment_events || schedule.repayment_events.length === 0) return false
    const totalPaid = schedule.repayment_events.reduce((sum: number, e: any) => sum + (e.amount_paid_minor || 0), 0)
    return totalPaid >= schedule.amount_due_minor
  }

  // Helper to check if schedule is partially paid
  const isSchedulePartial = (schedule: any) => {
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
    if (isSchedulePaid(schedule)) return 'paid'
    if (isSchedulePartial(schedule)) return 'partial'
    if (isPast(new Date(schedule.due_date))) return 'overdue'
    return 'pending'
  }

  const calculateProgress = () => {
    if (!loan || !loan.repayment_schedules) return 0
    const paid = loan.repayment_schedules.filter((s: any) => isSchedulePaid(s)).length
    const total = loan.repayment_schedules.length
    return total > 0 ? Math.round((paid / total) * 100) : 0
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
      }
    }

    const schedules = loan.repayment_schedules
    const totalPayments = schedules.length
    const paidPayments = schedules.filter((s: any) => isSchedulePaid(s)).length

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

    const progressPercentage = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0

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

                    <div className="space-y-2">
                      <Label htmlFor="lender-signed-file">Upload Signed Agreement</Label>
                      <Input
                        id="lender-signed-file"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error('File size must be less than 5MB')
                              e.target.value = ''
                              return
                            }
                            setSignedAgreementFile(file)
                          }
                        }}
                        className="cursor-pointer"
                      />
                      {signedAgreementFile && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <FileText className="h-4 w-4" />
                          <span>Selected: {signedAgreementFile.name}</span>
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

      {/* Repayment Schedule - Only show for tracked loans */}
      {['active', 'completed', 'defaulted', 'written_off'].includes(loan.status) && (
        <Card>
          <CardHeader>
            <CardTitle>Repayment Schedule</CardTitle>
            <CardDescription>Track and mark payments as they come in</CardDescription>
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
                          {formatCurrency(schedule.principal_portion_minor || 0, loan.country_code)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(schedule.interest_portion_minor || 0, loan.country_code)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(status)}
                        </TableCell>
                        <TableCell>
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
                          {status === 'paid' && getSchedulePaidAt(schedule) && (
                            <span className="text-sm text-muted-foreground">
                              Paid {format(new Date(getSchedulePaidAt(schedule)), 'MMM dd')}
                            </span>
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
    </div>
  )
}
