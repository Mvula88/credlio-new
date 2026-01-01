'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CreditCard,
  Calendar,
  DollarSign,
  TrendingUp,
  FileText,
  Download,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  ChevronRight,
  Receipt,
  Calculator,
  Banknote,
  Target,
  Activity,
  BarChart3,
  History,
  Shield,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  Upload,
  Loader2,
  Send,
  XCircle,
  Wallet
} from 'lucide-react'
import { format, addMonths, differenceInDays, parseISO, isPast } from 'date-fns'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { getCurrencyByCountry, getCurrencyInfo, formatCurrency as formatCurrencyUtil, type CurrencyInfo } from '@/lib/utils/currency'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar
} from 'recharts'

export default function BorrowerLoansPage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [borrower, setBorrower] = useState<any>(null)
  const [borrowerCurrency, setBorrowerCurrency] = useState<CurrencyInfo | null>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [pendingOffersCount, setPendingOffersCount] = useState(0)
  const [selectedLoan, setSelectedLoan] = useState<any>(null)
  const [repaymentSchedule, setRepaymentSchedule] = useState<any[]>([])
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [loanStats, setLoanStats] = useState<any>(null)
  const [downloadingAgreement, setDownloadingAgreement] = useState(false)
  const [signedAgreementFile, setSignedAgreementFile] = useState<File | null>(null)
  const [uploadingSignedAgreement, setUploadingSignedAgreement] = useState(false)
  const [agreementData, setAgreementData] = useState<any>(null)
  const [disbursementData, setDisbursementData] = useState<any>(null)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)
  const [disputeDialog, setDisputeDialog] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [cancelDialog, setCancelDialog] = useState(false)
  const [cancellingLoan, setCancellingLoan] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadLoansData()
  }, [])

  const loadLoansData = async () => {
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

      // Get borrower link
      const { data: linkData, error: linkError } = await supabase
        .from('borrower_user_links')
        .select('borrower_id')
        .eq('user_id', user.id)
        .single()

      console.log('Borrower link:', { linkData, linkError, userId: user.id })

      if (linkData) {
        // Get borrower record
        const { data: borrowerData } = await supabase
          .from('borrowers')
          .select('*')
          .eq('id', linkData.borrower_id)
          .single()

        if (borrowerData) {
          setBorrower(borrowerData)

          // Load borrower's currency
          const currency = getCurrencyByCountry(borrowerData.country_code)
          if (currency) {
            setBorrowerCurrency(currency)
          }
        }

        // Get ALL loans (including completed/past) for this borrower
        // Note: repayment_events is linked through repayment_schedules, not directly to loans
        const { data: loansData, error: loansError } = await supabase
          .from('loans')
          .select(`
            *,
            lenders(
              business_name,
              email
            ),
            repayment_schedules(
              *,
              repayment_events(*)
            )
          `)
          .eq('borrower_id', linkData.borrower_id)
          .order('created_at', { ascending: false })

        console.log('Loans query result:', {
          loansData,
          loansError,
          borrowerId: linkData.borrower_id,
          loansCount: loansData?.length || 0,
          statuses: loansData?.map((l: any) => l.status) || []
        })

        if (loansData && loansData.length > 0) {
          // Count pending offers
          const pendingOffers = loansData.filter((l: any) => l.status === 'pending_offer')
          setPendingOffersCount(pendingOffers.length)

          // Filter out pending offers, declined, and cancelled for the main loans view
          const activeLoans = loansData.filter((l: any) =>
            l.status !== 'pending_offer' &&
            l.status !== 'declined' &&
            l.status !== 'cancelled'
          )
          setLoans(activeLoans)

          // Prefer selecting an active loan, then pending_signatures, then any other
          setSelectedLoan(
            activeLoans.find((l: any) => l.status === 'active') ||
            activeLoans.find((l: any) => l.status === 'pending_signatures') ||
            activeLoans[0]
          )

          // Calculate stats (exclude pending offers)
          calculateLoanStats(activeLoans)
        }
      }
    } catch (error) {
      console.error('Error loading loans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadAgreement = async (loanId: string) => {
    try {
      setDownloadingAgreement(true)

      // Call API to generate/fetch agreement
      const response = await fetch(`/api/loans/agreement?loanId=${loanId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download agreement')
      }

      // Get the HTML content
      const htmlContent = await response.text()

      // Create a temporary container for rendering
      const container = document.createElement('div')
      container.innerHTML = htmlContent
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '800px'
      container.style.padding = '40px'
      container.style.background = 'white'
      document.body.appendChild(container)

      // Generate PDF using html2canvas and jsPDF
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      // Remove the temporary container
      document.body.removeChild(container)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')

      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      // Add Credlio watermark to all pages
      const totalPages = pdf.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)

        // Diagonal watermark
        pdf.setTextColor(200, 200, 200)
        pdf.setFontSize(60)
        pdf.setFont('helvetica', 'bold')
        const centerX = imgWidth / 2
        const centerY = pageHeight / 2
        pdf.text('CREDLIO', centerX, centerY, { angle: 45, align: 'center' })

        // Footer
        pdf.setFontSize(10)
        pdf.setTextColor(150, 150, 150)
        pdf.text('Powered by Credlio - Secure Lending Platform', imgWidth / 2, pageHeight - 10, { align: 'center' })

        // Page number
        pdf.setFontSize(9)
        pdf.text(`Page ${i} of ${totalPages}`, imgWidth - 15, pageHeight - 10, { align: 'right' })
      }

      // Download the PDF
      pdf.save(`loan-agreement-${loanId}.pdf`)
    } catch (error: any) {
      console.error('Error downloading agreement:', error)
      alert(error.message || 'Failed to download loan agreement')
    } finally {
      setDownloadingAgreement(false)
    }
  }

  const handleUploadSignedAgreement = async () => {
    if (!signedAgreementFile || !agreementData || !selectedLoan) {
      alert('Please select a file to upload')
      return
    }

    try {
      setUploadingSignedAgreement(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('Please sign in to continue')
        return
      }

      // Read file once and compute hash BEFORE upload (faster)
      const arrayBuffer = await signedAgreementFile.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const signedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Upload file to Supabase Storage
      const fileExt = signedAgreementFile.name.split('.').pop()
      const fileName = `${user.id}/loan-${selectedLoan.id}/borrower-signed-${Date.now()}.${fileExt}`
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

      // Save signed agreement to database
      const { error: dbError } = await supabase
        .rpc('upload_borrower_signed_agreement', {
          p_agreement_id: agreementData.id,
          p_signed_url: publicUrl,
          p_signed_hash: signedHash
        })

      if (dbError) throw dbError

      alert('Signed agreement uploaded successfully!')
      setSignedAgreementFile(null)

      // Reload agreement data
      loadAgreementData(selectedLoan.id)
    } catch (error: any) {
      console.error('Error uploading signed agreement:', error)
      alert(error.message || 'Failed to upload signed agreement')
    } finally {
      setUploadingSignedAgreement(false)
    }
  }

  const calculateLoanStats = (loansData: any[]) => {
    // Only count actually disbursed loans (not pending_offer or pending_signatures)
    const disbursedStatuses = ['active', 'completed', 'defaulted', 'written_off']
    const disbursedLoans = loansData.filter((l: any) => disbursedStatuses.includes(l.status))

    // Keep in minor units (cents) - formatCurrency will convert to major
    const totalBorrowed = disbursedLoans.reduce((sum: number, loan: any) => {
      const principal = loan.principal_minor || (loan.principal_amount ? loan.principal_amount * 100 : 0)
      return sum + principal
    }, 0)

    // total_repaid_minor is in cents - use it directly or convert total_repaid from major
    const totalRepaid = loansData.reduce((sum: number, loan: any) => {
      const repaid = loan.total_repaid_minor || (loan.total_repaid ? loan.total_repaid * 100 : 0)
      return sum + repaid
    }, 0)

    const activeLoansCount = loansData.filter((l: any) => l.status === 'active').length
    const completedLoans = loansData.filter((l: any) => l.status === 'completed').length

    const totalInterestPaid = loansData.reduce((sum: number, loan: any) => {
      const paid = loan.repayment_events?.reduce((s: number, e: any) =>
        e.status === 'completed' ? s + (e.interest_amount || 0) : s, 0) || 0
      return sum + paid
    }, 0)

    // Calculate average APR safely - use total_interest_percent, apr_bps, or interest_rate
    const loansWithRates = disbursedLoans.filter((l: any) =>
      l.total_interest_percent || l.apr_bps || l.interest_rate || l.base_rate_percent
    )
    const avgAPR = loansWithRates.length > 0
      ? loansWithRates.reduce((sum: number, loan: any) => {
          const rate = loan.total_interest_percent ||
                       (loan.apr_bps ? loan.apr_bps / 100 : 0) ||
                       loan.interest_rate ||
                       loan.base_rate_percent || 0
          return sum + rate
        }, 0) / loansWithRates.length
      : 0

    setLoanStats({
      totalBorrowed,
      totalRepaid,
      activeLoans: activeLoansCount,
      completedLoans,
      totalInterestPaid,
      averageAPR: avgAPR
    })
  }

  useEffect(() => {
    if (selectedLoan) {
      setRepaymentSchedule(selectedLoan.repayment_schedules || [])
      setPaymentHistory(selectedLoan.repayment_events || [])
      loadAgreementData(selectedLoan.id)
      loadDisbursementData(selectedLoan.id)
    }
  }, [selectedLoan])

  const loadAgreementData = async (loanId: string) => {
    const { data: agreement } = await supabase
      .from('loan_agreements')
      .select('*')
      .eq('loan_id', loanId)
      .maybeSingle()

    setAgreementData(agreement)
  }

  const loadDisbursementData = async (loanId: string) => {
    const { data: disbursement } = await supabase
      .from('disbursement_proofs')
      .select('*')
      .eq('loan_id', loanId)
      .maybeSingle()

    setDisbursementData(disbursement)
  }

  const handleConfirmReceipt = async () => {
    if (!selectedLoan) return

    try {
      setConfirmingReceipt(true)

      const { error } = await supabase.rpc('confirm_disbursement_receipt', {
        p_loan_id: selectedLoan.id,
        p_notes: null
      })

      if (error) throw error

      alert('Funds received confirmed! Your loan is now active.')
      loadLoansData() // Reload to get updated loan status
    } catch (error: any) {
      console.error('Error confirming receipt:', error)
      alert(error.message || 'Failed to confirm receipt')
    } finally {
      setConfirmingReceipt(false)
    }
  }

  const handleDisputeDisbursement = async () => {
    if (!selectedLoan || !disputeReason.trim()) {
      alert('Please provide a reason for the dispute')
      return
    }

    try {
      setSubmittingDispute(true)

      const { error } = await supabase.rpc('dispute_disbursement', {
        p_loan_id: selectedLoan.id,
        p_reason: disputeReason
      })

      if (error) throw error

      alert('Dispute submitted. The lender has been notified.')
      setDisputeDialog(false)
      setDisputeReason('')
      loadDisbursementData(selectedLoan.id)
    } catch (error: any) {
      console.error('Error disputing disbursement:', error)
      alert(error.message || 'Failed to submit dispute')
    } finally {
      setSubmittingDispute(false)
    }
  }

  // Cancel loan before signing
  const handleCancelLoan = async () => {
    if (!selectedLoan) return

    try {
      setCancellingLoan(true)

      const { data, error } = await supabase.rpc('cancel_loan_by_borrower', {
        p_loan_id: selectedLoan.id
      })

      if (error) {
        console.error('Error cancelling loan:', JSON.stringify(error, null, 2))
        alert(error.message || error.details || error.hint || error.code || 'Failed to cancel loan')
        return
      }

      alert('Loan cancelled successfully. You can create a new loan request if needed.')
      setCancelDialog(false)
      setSelectedLoan(null)
      loadLoansData()
    } catch (error: any) {
      console.error('Error cancelling loan:', error)
      alert(error.message || 'Failed to cancel loan')
    } finally {
      setCancellingLoan(false)
    }
  }

  // Check if borrower can cancel the loan
  const canCancelLoan = () => {
    if (!selectedLoan) return false
    // Can only cancel if pending_signatures
    if (selectedLoan.status !== 'pending_signatures') return false
    // If no agreement data, they definitely haven't signed yet
    if (!agreementData) return true
    // If agreement exists but borrower hasn't signed, can still cancel
    return !agreementData.borrower_signed_at
  }

  // Format currency based on the loan's currency (not borrower's default)
  const formatCurrency = (amountMinor: number, currencyCode?: string) => {
    // Try to get currency from the loan's currency code first
    if (currencyCode) {
      const loanCurrency = getCurrencyInfo(currencyCode)
      if (loanCurrency) {
        return formatCurrencyUtil(amountMinor, loanCurrency)
      }
    }

    // Fall back to borrower's currency
    if (borrowerCurrency) {
      return formatCurrencyUtil(amountMinor, borrowerCurrency)
    }

    // Last resort fallback to USD
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amountMinor / 100)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'pending_signatures': return 'bg-purple-100 text-purple-800'
      case 'pending_disbursement': return 'bg-orange-100 text-orange-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'defaulted': return 'bg-red-100 text-red-800'
      case 'overdue': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_signatures': return 'Awaiting Signatures'
      case 'pending_disbursement': return 'Awaiting Funds'
      case 'pending_offer': return 'Offer Pending'
      default: return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')
    }
  }

  const calculateLoanProgress = (loan: any) => {
    if (!loan) return 0
    // total_amount_minor is in cents, total_repaid is in major units (dollars)
    // Convert total_repaid to minor units for consistent calculation
    const totalAmountMinor = loan.total_amount_minor || (loan.total_amount || 0) * 100
    const totalRepaidMinor = (loan.total_repaid || 0) * 100
    // Prevent division by zero and NaN
    if (totalAmountMinor <= 0) return 0
    const progress = Math.round((totalRepaidMinor / totalAmountMinor) * 100)
    // Ensure progress is a valid number between 0-100
    return isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress))
  }

  const getNextPayment = (loan: any) => {
    if (!loan.repayment_schedules) return null
    const pending = loan.repayment_schedules
      .filter((s: any) => s.status === 'pending')
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    return pending[0]
  }

  const generateRepaymentChart = () => {
    if (!selectedLoan || !selectedLoan.repayment_schedules) return []
    
    return selectedLoan.repayment_schedules.map((schedule: any, index: number) => ({
      month: format(new Date(schedule.due_date), 'MMM'),
      principal: schedule.principal_amount,
      interest: schedule.interest_amount,
      total: schedule.amount,
      status: schedule.status
    }))
  }

  const generatePaymentProgressData = () => {
    if (!selectedLoan) return []

    // Convert to same units (minor/cents) for consistent calculations
    const paidMinor = (selectedLoan.total_repaid || 0) * 100
    const totalMinor = selectedLoan.total_amount_minor || (selectedLoan.total_amount || 0) * 100
    const remainingMinor = Math.max(0, totalMinor - paidMinor)

    return [
      { name: 'Paid', value: paidMinor, color: '#10b981' },
      { name: 'Remaining', value: remainingMinor, color: '#e5e7eb' }
    ]
  }

  // NEW: Payment analytics for health score
  const getPaymentAnalytics = (loan: any) => {
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
    const paidPayments = schedules.filter((s: any) => s.status === 'paid').length

    let onTimePayments = 0
    let latePayments = 0

    schedules.forEach((s: any) => {
      if (s.status === 'paid' && s.paid_at) {
        const dueDate = new Date(s.due_date)
        const paidDate = new Date(s.paid_at)
        if (paidDate <= dueDate) {
          onTimePayments++
        } else {
          latePayments++
        }
      }
    })

    const pendingPayments = schedules.filter((s: any) => s.status === 'pending').length
    const overduePayments = schedules.filter((s: any) => {
      if (s.status === 'paid') return false
      return isPast(new Date(s.due_date))
    }).length

    const progressPercentage = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0

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

  const getRadialChartData = (loan: any) => {
    const analytics = getPaymentAnalytics(loan)
    return [
      {
        name: 'Progress',
        value: analytics.progressPercentage,
        fill: analytics.paymentHealthScore >= 80 ? '#22c55e' :
              analytics.paymentHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  // NEW: Overall analytics across all loans
  const getOverallPaymentAnalytics = () => {
    if (loans.length === 0) {
      return {
        totalOnTime: 0,
        totalLate: 0,
        totalOverdue: 0,
        onTimePaymentRate: 0,
        averageHealthScore: 0,
      }
    }

    let totalOnTime = 0
    let totalLate = 0
    let totalOverdue = 0
    let totalPaid = 0

    loans.forEach(loan => {
      const analytics = getPaymentAnalytics(loan)
      totalOnTime += analytics.onTimePayments
      totalLate += analytics.latePayments
      totalOverdue += analytics.overduePayments
      totalPaid += analytics.paidPayments
    })

    const onTimeRate = totalPaid > 0 ? Math.round((totalOnTime / totalPaid) * 100) : 0
    const healthScores = loans.map(l => getPaymentAnalytics(l).paymentHealthScore).filter(s => s > 0)
    const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0

    return {
      totalOnTime,
      totalLate,
      totalOverdue,
      onTimePaymentRate: onTimeRate,
      averageHealthScore: avgHealth,
    }
  }

  const getOverallRadialData = () => {
    const overall = getOverallPaymentAnalytics()
    return [
      {
        name: 'Overall',
        value: overall.onTimePaymentRate,
        fill: overall.averageHealthScore >= 80 ? '#22c55e' :
              overall.averageHealthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const nextPayment = selectedLoan ? getNextPayment(selectedLoan) : null
  const repaymentChartData = generateRepaymentChart()
  const progressData = generatePaymentProgressData()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Loans</h1>
          <p className="text-gray-600 mt-1">
            Manage and track all your loan details and repayments
          </p>
        </div>
        <Button onClick={() => router.push('/b/requests')}>
          <CreditCard className="mr-2 h-4 w-4" />
          Request New Loan
        </Button>
      </div>

      {/* Pending Offers Banner */}
      {pendingOffersCount > 0 && (
        <Alert className="border-2 border-yellow-400 bg-yellow-50">
          <Clock className="h-5 w-5 text-yellow-600" />
          <AlertTitle className="text-yellow-900 text-lg">
            You have {pendingOffersCount} pending loan offer{pendingOffersCount > 1 ? 's' : ''}!
          </AlertTitle>
          <AlertDescription className="text-yellow-800">
            <p className="mb-3">
              A lender has offered you a loan. Review the terms and accept or decline.
            </p>
            <Button
              onClick={() => router.push('/b/loans/offers')}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              <Eye className="mr-2 h-4 w-4" />
              Review Loan Offer{pendingOffersCount > 1 ? 's' : ''}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Overview */}
      {loanStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Borrowed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(loanStats.totalBorrowed, selectedLoan?.currency)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Repaid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(loanStats.totalRepaid, selectedLoan?.currency)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Interest Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(loanStats.totalInterestPaid, selectedLoan?.currency)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loanStats.activeLoans}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{loanStats.completedLoans}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg. APR</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{isNaN(loanStats.averageAPR) ? '0.0' : loanStats.averageAPR.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overall Payment Performance Summary for THIS Borrower - NEW */}
      {loans.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle>My Complete Payment History</CardTitle>
            </div>
            <CardDescription>
              Your permanent payment record across all loans - never deleted, used for credit assessment
            </CardDescription>
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
                      data={getOverallRadialData()}
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
                      {getOverallPaymentAnalytics().onTimePaymentRate}%
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">On-Time Rate</div>
                    <div className="mt-3 flex items-center gap-1">
                      <Award className={`h-5 w-5 ${
                        getOverallPaymentAnalytics().averageHealthScore >= 80 ? 'text-green-600' :
                        getOverallPaymentAnalytics().averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`} />
                      <span className={`text-sm font-semibold ${
                        getOverallPaymentAnalytics().averageHealthScore >= 80 ? 'text-green-600' :
                        getOverallPaymentAnalytics().averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {getOverallPaymentAnalytics().averageHealthScore}% Health
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overall Statistics */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                      <span className="text-sm">On-Time Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalOnTime}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <span className="text-sm">Late Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalLate}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <span className="text-sm">Overdue Payments</span>
                    </div>
                    <span className="font-semibold">{getOverallPaymentAnalytics().totalOverdue}</span>
                  </div>
                </div>

                <Alert className="bg-blue-50 border-blue-200 mt-4">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-900">
                    <strong>Permanent Record:</strong> This history stays forever and helps lenders trust you for future loans.
                  </AlertDescription>
                </Alert>

                {getOverallPaymentAnalytics().averageHealthScore >= 80 && (
                  <Alert className="bg-green-50 border-green-200">
                    <Award className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-sm text-green-900">
                      Excellent payment history! Your strong record qualifies you for better loan terms.
                    </AlertDescription>
                  </Alert>
                )}

                {getOverallPaymentAnalytics().averageHealthScore >= 60 && getOverallPaymentAnalytics().averageHealthScore < 80 && (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-sm text-yellow-900">
                      Good record. Keep making on-time payments to improve your score.
                    </AlertDescription>
                  </Alert>
                )}

                {getOverallPaymentAnalytics().averageHealthScore < 60 && (
                  <Alert className="bg-red-50 border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-sm text-red-900">
                      Payment issues detected. Contact your lenders to discuss payment options.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loans.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Loans Yet</h3>
            <p className="text-gray-600 mb-4">You haven't taken any loans yet. Start by requesting a loan.</p>
            <Button onClick={() => router.push('/b/requests')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Request a Loan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Pending Loans Section - Always visible at top */}
        {loans.filter(l => l.status === 'pending_signatures').length > 0 && (
          <Card className="border-2 border-purple-300 bg-purple-50 mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <Clock className="h-5 w-5 text-purple-600 animate-pulse" />
                Loans Awaiting Your Signature
              </CardTitle>
              <CardDescription className="text-purple-700">
                These loans need your signature before they can proceed. You can cancel before signing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loans.filter(l => l.status === 'pending_signatures').map((loan) => (
                <div key={loan.id} className="bg-white rounded-lg p-4 border border-purple-200 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-lg">{formatCurrency(loan.principal_minor, loan.currency)}</p>
                    <p className="text-sm text-gray-600">
                      {loan.term_months} months • {loan.apr_bps / 100}% interest • Lender: {loan.lenders?.business_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      Created: {format(new Date(loan.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setSelectedLoan(loan)
                        router.push(`/b/loans/${loan.id}`)
                      }}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Sign Agreement
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setSelectedLoan(loan)
                        setCancelDialog(true)
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">Payment Schedule</TabsTrigger>
            <TabsTrigger value="history">Payment History</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Loan Selector */}
            {loans.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-2">
                {loans.map((loan) => (
                  <Button
                    key={loan.id}
                    variant={selectedLoan?.id === loan.id ? 'default' : 'outline'}
                    onClick={() => setSelectedLoan(loan)}
                    className="whitespace-nowrap"
                  >
                    Loan #{loan.id.slice(0, 8)}
                    <Badge className={`ml-2 ${getStatusColor(loan.status)}`}>
                      {getStatusLabel(loan.status)}
                    </Badge>
                  </Button>
                ))}
              </div>
            )}

            {selectedLoan && (
              <>
                {/* Action Required Alert */}
                {(selectedLoan.status === 'pending_signatures' || selectedLoan.status === 'pending_disbursement') && (
                  <Alert className="border-2 border-orange-400 bg-orange-50">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    <AlertTitle className="text-orange-900">
                      {selectedLoan.status === 'pending_signatures' ? 'Signature Required' : 'Confirm Receipt of Funds'}
                    </AlertTitle>
                    <AlertDescription className="text-orange-800">
                      <p className="mb-3">
                        {selectedLoan.status === 'pending_signatures'
                          ? 'You need to sign the loan agreement before the loan can proceed.'
                          : 'Your lender has sent the funds. Please confirm receipt to activate your loan.'}
                      </p>
                      <div className="flex gap-3 mt-3">
                        <Button onClick={() => router.push(`/b/loans/${selectedLoan.id}`)} className="bg-orange-600 hover:bg-orange-700">
                          <Eye className="mr-2 h-4 w-4" />
                          {selectedLoan.status === 'pending_signatures' ? 'Sign Agreement' : 'Confirm Funds'}
                        </Button>
                        {canCancelLoan() && (
                          <Button
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => setCancelDialog(true)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel Loan
                          </Button>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Current Loan Details */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>Loan Details</CardTitle>
                        <CardDescription>
                          Loan ID: {selectedLoan.id}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => router.push(`/b/loans/${selectedLoan.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadAgreement(selectedLoan.id)}
                          disabled={downloadingAgreement}
                          className="text-blue-600 border-blue-300 hover:bg-blue-50"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {downloadingAgreement ? 'Generating PDF...' : 'Download PDF'}
                        </Button>
                        <Badge className={getStatusColor(selectedLoan.status)}>
                          {getStatusLabel(selectedLoan.status)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Loan Amount Breakdown - Clear Visual */}
                    <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/50">
                      <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <Calculator className="h-4 w-4" />
                        Loan Breakdown
                      </h4>
                      {(() => {
                        // Calculate values with proper fallbacks to avoid NaN
                        const principal = selectedLoan.principal_minor || (selectedLoan.principal_amount ? selectedLoan.principal_amount * 100 : 0)
                        const interestRate = selectedLoan.total_interest_percent || selectedLoan.base_rate_percent || (selectedLoan.apr_bps ? selectedLoan.apr_bps / 100 : 0) || selectedLoan.interest_rate || 0
                        const interestAmount = selectedLoan.interest_amount_minor || (principal * interestRate / 100)
                        const totalAmount = selectedLoan.total_amount_minor || (principal + interestAmount)
                        const paymentType = selectedLoan.payment_type || (selectedLoan.term_months <= 1 ? 'once_off' : 'installments')
                        const numInstallments = selectedLoan.num_installments || selectedLoan.term_months || 1

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Principal (Borrowed)</p>
                              <p className="text-xl font-bold">
                                {formatCurrency(principal, selectedLoan.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Interest Rate</p>
                              <p className="text-xl font-bold text-orange-600">
                                {interestRate}%
                              </p>
                              {paymentType === 'installments' && selectedLoan.extra_rate_per_installment > 0 && (
                                <p className="text-xs text-gray-500">
                                  ({selectedLoan.base_rate_percent}% base + {selectedLoan.extra_rate_per_installment}% × {numInstallments - 1})
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Interest Amount</p>
                              <p className="text-xl font-bold text-orange-600">
                                {formatCurrency(interestAmount, selectedLoan.currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Payment Type</p>
                              <p className="text-xl font-bold">
                                {paymentType === 'once_off' ? 'Once-off' : `${numInstallments} Installments`}
                              </p>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Total & Progress */}
                    {(() => {
                      // Calculate totals with proper fallbacks
                      const principal = selectedLoan.principal_minor || (selectedLoan.principal_amount ? selectedLoan.principal_amount * 100 : 0)
                      const interestRate = selectedLoan.total_interest_percent || selectedLoan.base_rate_percent || (selectedLoan.apr_bps ? selectedLoan.apr_bps / 100 : 0) || selectedLoan.interest_rate || 0
                      const interestAmount = selectedLoan.interest_amount_minor || (principal * interestRate / 100)
                      const totalToPay = selectedLoan.total_amount_minor || (principal + interestAmount) || 0
                      const totalRepaid = (selectedLoan.total_repaid_minor || (selectedLoan.total_repaid ? selectedLoan.total_repaid * 100 : 0)) || 0
                      const remaining = Math.max(0, totalToPay - totalRepaid)

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="p-4 bg-blue-100 rounded-lg">
                            <p className="text-sm text-blue-700">Total to Pay</p>
                            <p className="text-2xl font-bold text-blue-900">
                              {formatCurrency(totalToPay, selectedLoan.currency)}
                            </p>
                          </div>
                          <div className="p-4 bg-green-100 rounded-lg">
                            <p className="text-sm text-green-700">Total Repaid</p>
                            <p className="text-2xl font-bold text-green-900">
                              {formatCurrency(totalRepaid, selectedLoan.currency)}
                            </p>
                          </div>
                          <div className="p-4 bg-gray-100 rounded-lg">
                            <p className="text-sm text-gray-700">Remaining</p>
                            <p className="text-2xl font-bold text-gray-900">
                              {formatCurrency(remaining, selectedLoan.currency)}
                            </p>
                          </div>
                        </div>
                      )
                    })()}

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Repayment Progress</span>
                        <span>{calculateLoanProgress(selectedLoan)}%</span>
                      </div>
                      <Progress value={calculateLoanProgress(selectedLoan)} className="h-3" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Lender</p>
                        <p className="font-medium">{selectedLoan.lenders?.business_name}</p>
                        <p className="text-sm text-gray-500">{selectedLoan.lenders?.contact_email}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Loan Dates</p>
                        <p className="font-medium">
                          Started: {format(new Date(selectedLoan.created_at), 'MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-gray-500">
                          Expected End: {format(addMonths(new Date(selectedLoan.created_at), selectedLoan.term_months), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Signed Agreement Section */}
                {agreementData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Loan Agreement Signatures
                      </CardTitle>
                      <CardDescription>
                        Both parties must upload their signed copy for legal validity
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Borrower Signature Status */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Your Signature (Borrower)</h3>
                            {agreementData.borrower_signed_at ? (
                              <Badge className="bg-green-600">
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
                                    console.log('Borrower file selected:', file?.name, file?.size)
                                    if (file) {
                                      if (file.size > 25 * 1024 * 1024) {
                                        alert('File size must be less than 25MB')
                                        e.target.value = ''
                                        return
                                      }
                                      setSignedAgreementFile(file)
                                      alert(`File selected: ${file.name}`)
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

                        {/* Lender Signature Status */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Lender's Signature</h3>
                            {agreementData.lender_signed_at ? (
                              <Badge className="bg-green-600">
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
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600">
                                Waiting for lender to sign and upload their copy...
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

                {/* Disbursement Confirmation Section - For pending_disbursement loans */}
                {selectedLoan.status === 'pending_disbursement' && (
                  <Card className="border-2 border-orange-300 bg-orange-50/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-orange-900">
                        <Wallet className="h-5 w-5" />
                        Confirm Receipt of Funds
                      </CardTitle>
                      <CardDescription>
                        Your lender has sent the loan funds. Please confirm once you receive them.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {disbursementData?.lender_submitted_at ? (
                        <>
                          {/* Lender has submitted proof */}
                          <Alert className="bg-blue-50 border-blue-200">
                            <Send className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-900">Funds Sent by Lender</AlertTitle>
                            <AlertDescription className="text-blue-800">
                              Your lender submitted proof of disbursement on{' '}
                              {format(new Date(disbursementData.lender_submitted_at), 'MMM d, yyyy HH:mm')}
                            </AlertDescription>
                          </Alert>

                          {/* Disbursement Details */}
                          <div className="bg-white rounded-lg p-4 border space-y-3">
                            <h4 className="font-semibold">Disbursement Details</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-gray-600">Amount Sent</p>
                                <p className="font-bold text-lg">
                                  {formatCurrency(disbursementData.lender_proof_amount * 100, selectedLoan.currency)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Method</p>
                                <p className="font-medium capitalize">
                                  {disbursementData.lender_proof_method?.replace('_', ' ') || 'Not specified'}
                                </p>
                              </div>
                              {disbursementData.lender_proof_reference && (
                                <div>
                                  <p className="text-gray-600">Reference/Transaction ID</p>
                                  <p className="font-medium">{disbursementData.lender_proof_reference}</p>
                                </div>
                              )}
                              {disbursementData.lender_proof_date && (
                                <div>
                                  <p className="text-gray-600">Date Sent</p>
                                  <p className="font-medium">
                                    {format(new Date(disbursementData.lender_proof_date), 'MMM d, yyyy')}
                                  </p>
                                </div>
                              )}
                            </div>
                            {disbursementData.lender_proof_notes && (
                              <div>
                                <p className="text-gray-600 text-sm">Notes from Lender</p>
                                <p className="text-sm">{disbursementData.lender_proof_notes}</p>
                              </div>
                            )}
                            {disbursementData.lender_proof_url && (
                              <a
                                href={disbursementData.lender_proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View Proof of Transfer
                              </a>
                            )}
                          </div>

                          {/* Already disputed? */}
                          {disbursementData.borrower_disputed ? (
                            <Alert className="bg-red-50 border-red-200">
                              <XCircle className="h-4 w-4 text-red-600" />
                              <AlertTitle className="text-red-900">Dispute Submitted</AlertTitle>
                              <AlertDescription className="text-red-800">
                                You disputed this disbursement on{' '}
                                {format(new Date(disbursementData.borrower_disputed_at), 'MMM d, yyyy HH:mm')}.
                                <br />
                                <strong>Reason:</strong> {disbursementData.borrower_dispute_reason}
                              </AlertDescription>
                            </Alert>
                          ) : (
                            /* Action buttons */
                            <div className="flex flex-col sm:flex-row gap-3">
                              <Button
                                onClick={handleConfirmReceipt}
                                disabled={confirmingReceipt}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                              >
                                {confirmingReceipt ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Confirming...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    I Received the Funds
                                  </>
                                )}
                              </Button>

                              <Dialog open={disputeDialog} onOpenChange={setDisputeDialog}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
                                    <XCircle className="h-4 w-4 mr-2" />
                                    I Did Not Receive Funds
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Dispute Disbursement</DialogTitle>
                                    <DialogDescription>
                                      If you did not receive the funds, please explain the situation.
                                      The lender will be notified.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Reason for Dispute *</Label>
                                      <Textarea
                                        value={disputeReason}
                                        onChange={(e) => setDisputeReason(e.target.value)}
                                        placeholder="Explain why you did not receive the funds..."
                                        rows={4}
                                      />
                                    </div>
                                    <div className="flex gap-3 justify-end">
                                      <Button variant="outline" onClick={() => setDisputeDialog(false)}>
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={handleDisputeDisbursement}
                                        disabled={submittingDispute || !disputeReason.trim()}
                                        className="bg-red-600 hover:bg-red-700"
                                      >
                                        {submittingDispute ? (
                                          <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Submitting...
                                          </>
                                        ) : (
                                          'Submit Dispute'
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Lender hasn't submitted proof yet */
                        <Alert>
                          <Clock className="h-4 w-4" />
                          <AlertTitle>Waiting for Lender</AlertTitle>
                          <AlertDescription>
                            Your lender has not yet submitted proof of disbursement.
                            You will be notified once the funds are sent.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Next Payment Alert */}
                {nextPayment && selectedLoan.status === 'active' && (
                  <Alert className={differenceInDays(new Date(nextPayment.due_date), new Date()) < 7 ? 'border-orange-200 bg-orange-50' : ''}>
                    <Calendar className="h-4 w-4" />
                    <AlertTitle>Next Payment Due</AlertTitle>
                    <AlertDescription>
                      <div className="flex justify-between items-center mt-2">
                        <div>
                          <p className="font-semibold text-lg">
                            {formatCurrency(nextPayment.amount, selectedLoan.currency)}
                          </p>
                          <p className="text-sm">
                            Due on {format(new Date(nextPayment.due_date), 'MMMM dd, yyyy')}
                            {' '}({differenceInDays(new Date(nextPayment.due_date), new Date())} days)
                          </p>
                        </div>
                        <Button>Make Payment</Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Payment Performance for This Loan - NEW */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Payment Performance
                    </CardTitle>
                    <CardDescription>Track your payment health for this loan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Circular Progress Chart for Individual Loan */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="relative w-full max-w-[250px] aspect-square">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                              cx="50%"
                              cy="50%"
                              innerRadius="60%"
                              outerRadius="90%"
                              barSize={35}
                              data={getRadialChartData(selectedLoan)}
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
                            <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                              {getPaymentAnalytics(selectedLoan).progressPercentage}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Complete</div>
                            <div className="mt-2 flex items-center gap-1">
                              <Award className={`h-4 w-4 ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'text-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                              }`} />
                              <span className={`text-xs font-semibold ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'text-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {getPaymentAnalytics(selectedLoan).paymentHealthScore}% Health
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Payment Statistics for Individual Loan */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-sm">On-Time</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).onTimePayments}</span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <span className="text-sm">Late</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).latePayments}</span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            <span className="text-sm">Pending</span>
                          </div>
                          <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).pendingPayments}</span>
                        </div>

                        {getPaymentAnalytics(selectedLoan).overduePayments > 0 && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              <span className="text-sm">Overdue</span>
                            </div>
                            <span className="font-semibold text-sm">{getPaymentAnalytics(selectedLoan).overduePayments}</span>
                          </div>
                        )}

                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Payments Made</span>
                            <span className="text-xs font-semibold">
                              {getPaymentAnalytics(selectedLoan).paidPayments} / {getPaymentAnalytics(selectedLoan).totalPayments}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 ? 'bg-green-600' :
                                getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 ? 'bg-yellow-600' : 'bg-red-600'
                              }`}
                              style={{ width: `${getPaymentAnalytics(selectedLoan).progressPercentage}%` }}
                            />
                          </div>
                        </div>

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore >= 80 && (
                          <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <AlertDescription className="text-xs text-green-900">
                              Excellent! Keep it up!
                            </AlertDescription>
                          </Alert>
                        )}

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore >= 60 && getPaymentAnalytics(selectedLoan).paymentHealthScore < 80 && (
                          <Alert className="bg-yellow-50 border-yellow-200">
                            <AlertTriangle className="h-3 w-3 text-yellow-600" />
                            <AlertDescription className="text-xs text-yellow-900">
                              Good progress. Aim for on-time payments.
                            </AlertDescription>
                          </Alert>
                        )}

                        {getPaymentAnalytics(selectedLoan).paymentHealthScore < 60 && (
                          <Alert className="bg-red-50 border-red-200">
                            <AlertTriangle className="h-3 w-3 text-red-600" />
                            <AlertDescription className="text-xs text-red-900">
                              Contact your lender if you need help.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Repayment Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Repayment Breakdown</CardTitle>
                    <CardDescription>Principal vs Interest payments over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={repaymentChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip formatter={(value: any) => formatCurrency(value, selectedLoan.currency)} />
                          <Legend />
                          <Bar dataKey="principal" stackId="a" fill="#3b82f6" name="Principal" />
                          <Bar dataKey="interest" stackId="a" fill="#f59e0b" name="Interest" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Payment Schedule Tab */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Payment Schedule</CardTitle>
                    <CardDescription>
                      Your complete repayment schedule for this loan
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {repaymentSchedule.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment schedule available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment #</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Interest</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repaymentSchedule.map((schedule, index) => (
                        <TableRow key={schedule.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{format(new Date(schedule.due_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{formatCurrency(schedule.principal_amount, selectedLoan?.currency)}</TableCell>
                          <TableCell>{formatCurrency(schedule.interest_amount, selectedLoan?.currency)}</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(schedule.amount, selectedLoan?.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(schedule.status)}>
                              {schedule.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {schedule.status === 'pending' && (
                              <Button size="sm">Pay Now</Button>
                            )}
                            {schedule.status === 'paid' && (
                              <Button size="sm" variant="ghost">
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Payment History</CardTitle>
                    <CardDescription>
                      All your payment transactions for this loan
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Receipt className="mr-2 h-4 w-4" />
                    Download Receipts
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {paymentHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment history yet</p>
                ) : (
                  <div className="space-y-4">
                    {paymentHistory.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          {payment.status === 'completed' ? (
                            <CheckCircle className="h-8 w-8 text-green-500" />
                          ) : payment.status === 'pending' ? (
                            <Clock className="h-8 w-8 text-yellow-500" />
                          ) : (
                            <AlertCircle className="h-8 w-8 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium">
                              {formatCurrency(payment.amount, selectedLoan?.currency)} Payment
                            </p>
                            <p className="text-sm text-gray-600">
                              {format(new Date(payment.created_at), 'MMMM dd, yyyy at h:mm a')}
                            </p>
                            {payment.transaction_reference && (
                              <p className="text-xs text-gray-500">
                                Ref: {payment.transaction_reference}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status}
                          </Badge>
                          <Button size="sm" variant="ghost" className="mt-2">
                            <Download className="h-4 w-4 mr-1" />
                            Receipt
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Loan Documents</CardTitle>
                <CardDescription>
                  All documents related to your loan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">Loan Agreement</p>
                        <p className="text-sm text-gray-600">Signed on {format(new Date(selectedLoan?.created_at || new Date()), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">Repayment Schedule</p>
                        <p className="text-sm text-gray-600">Generated on {format(new Date(selectedLoan?.created_at || new Date()), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="h-8 w-8 text-purple-500" />
                      <div>
                        <p className="font-medium">Terms & Conditions</p>
                        <p className="text-sm text-gray-600">Version 1.0</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </>
      )}

      {/* Cancel Loan Confirmation Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Cancel This Loan?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this loan? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-900">What happens when you cancel:</AlertTitle>
              <AlertDescription className="text-orange-800">
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>This loan will be cancelled immediately</li>
                  <li>Your loan request will also be closed</li>
                  <li>The lender will be notified</li>
                  <li>You can create a new loan request if needed</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>
              Keep This Loan
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelLoan}
              disabled={cancellingLoan}
            >
              {cancellingLoan ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Yes, Cancel Loan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}