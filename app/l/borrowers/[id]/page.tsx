'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
  Shield,
  ArrowLeft,
  CreditCard,
  History,
  Award,
  Flag,
  Users,
  FileCheck,
  MapPin,
  Briefcase,
  Landmark,
  Link as LinkIcon,
  ExternalLink,
  Lock,
  Crown
} from 'lucide-react'
import { format, isPast } from 'date-fns'
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Flame, Star, Clock, MessageSquare, Sparkles, FileText } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { differenceInMonths, differenceInYears } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'

export default function LenderBorrowerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const borrowerId = params.id as string
  const [borrower, setBorrower] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [riskFlags, setRiskFlags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportType, setReportType] = useState<string>('')
  const [reportReason, setReportReason] = useState('')
  const [reportAmount, setReportAmount] = useState('')
  const [reportProof, setReportProof] = useState('')
  const [reportProofFile, setReportProofFile] = useState<File | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [submittingReport, setSubmittingReport] = useState(false)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [selectedFlagToResolve, setSelectedFlagToResolve] = useState<any>(null)
  const [resolutionReason, setResolutionReason] = useState('')
  const [resolvingFlag, setResolvingFlag] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageSubject, setMessageSubject] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [lenderTier, setLenderTier] = useState<string>('FREE')
  const supabase = createClient()

  // Check if lender has paid access (PRO or BUSINESS tier)
  const hasPaidAccess = lenderTier === 'PRO' || lenderTier === 'BUSINESS'

  useEffect(() => {
    loadBorrowerProfile()
  }, [borrowerId])

  const loadBorrowerProfile = async () => {
    try {
      // Verify user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/l/login')
        return
      }

      // Store current user ID for permission checks
      setCurrentUserId(user.id)
      const currentLenderId = user.id

      // Get lender's effective tier
      const { data: tierData } = await supabase.rpc('get_effective_tier', {
        p_user_id: user.id
      })
      if (tierData) {
        setLenderTier(tierData)
      }

      // IMPORTANT: This page handles TWO types of borrowers:
      // 1. Self-registered borrowers: Have user accounts, verification status, full profiles
      // 2. Tracked borrowers: Added manually by lenders, no user account, basic info only
      // We gracefully handle missing data for tracked borrowers

      console.log('Current user ID:', user.id)
      console.log('Attempting to load borrower:', borrowerId)

      const { data: borrowerData, error: borrowerError } = await supabase
        .from('borrowers')
        .select(`
          id,
          full_name,
          phone_e164,
          created_at,
          country_code,
          date_of_birth,
          street_address,
          city,
          postal_code,
          employment_status,
          employer_name,
          monthly_income_range,
          income_source,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact_relationship,
          next_of_kin_name,
          next_of_kin_phone,
          next_of_kin_relationship,
          bank_name,
          bank_account_number,
          bank_account_name,
          linkedin_url,
          facebook_url,
          has_social_media,
          borrower_scores(score)
        `)
        .eq('id', borrowerId)
        .maybeSingle()

      console.log('Borrower query result:', { data: borrowerData, error: borrowerError })

      if (borrowerError) {
        console.error('Error loading borrower:', borrowerError)
        throw borrowerError
      }

      if (!borrowerData) {
        console.error('Borrower not found - no data returned')
        setLoading(false)
        return
      }

      // Try to load self-verification status (only exists for self-registered borrowers)
      const { data: verificationStatus } = await supabase
        .from('borrower_self_verification_status')
        .select('verification_status')
        .eq('borrower_id', borrowerId)
        .maybeSingle()

      // Merge verification status if it exists
      const borrowerWithStatus = {
        ...borrowerData,
        borrower_self_verification_status: verificationStatus ? [verificationStatus] : []
      }

      setBorrower(borrowerWithStatus)

      // Get loans for this borrower from THIS LENDER ONLY
      // This ensures each lender sees only their own activity with the borrower
      // Only show loans that are being actively tracked (active, completed, defaulted, written_off)
      // Pending loans (pending_offer, pending_signatures) are shown in a separate section
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          lenders(business_name, email),
          repayment_schedules(*, repayment_events(*))
        `)
        .eq('borrower_id', borrowerId)
        .eq('lender_id', currentLenderId)
        .order('created_at', { ascending: false })

      if (loansError) {
        console.error('Error loading loans:', loansError)
        console.error('Loans error details:', JSON.stringify(loansError, null, 2))
        throw loansError
      }

      console.log('Loans loaded successfully:', loansData?.length || 0, 'loans')

      // Filter to only show active/tracked loans in the main view
      // Tracked statuses: active, completed, defaulted, written_off
      const trackedStatuses = ['active', 'completed', 'defaulted', 'written_off']
      const trackedLoans = (loansData || []).filter((loan: any) => trackedStatuses.includes(loan.status))
      const pendingLoans = (loansData || []).filter((loan: any) => !trackedStatuses.includes(loan.status))

      // Store all loans but mark which are pending
      setLoans(loansData || [])

      // Load risk flags for this borrower
      // Note: Some flags may not have lender info (system-generated or from deleted lenders)
      const { data: flagsData, error: flagsError } = await supabase
        .from('risk_flags')
        .select('*')
        .eq('borrower_id', borrowerId)
        .order('created_at', { ascending: false })

      if (flagsError) {
        console.error('Error loading risk flags:', flagsError)
        // Don't throw - just show empty flags if there's an error
        setRiskFlags([])
      } else {
        setRiskFlags(flagsData || [])
      }
    } catch (error: any) {
      console.error('Error loading borrower profile:', error)
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      })
    } finally {
      setLoading(false)
    }
  }

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

  const getOverallPaymentAnalytics = () => {
    if (loans.length === 0) {
      return {
        totalOnTime: 0,
        totalLate: 0,
        totalOverdue: 0,
        totalPaid: 0,
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
      totalPaid,
      onTimePaymentRate: onTimeRate,
      averageHealthScore: avgHealth,
    }
  }

  const getRadialChartData = (percentage: number, healthScore: number) => {
    return [
      {
        name: 'Payment Performance',
        value: percentage,
        fill: healthScore >= 80 ? '#22c55e' :
              healthScore >= 60 ? '#eab308' : '#ef4444',
      },
    ]
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completed</Badge>
      case 'defaulted':
        return <Badge variant="destructive">Defaulted</Badge>
      case 'written_off':
        return <Badge variant="secondary">Written Off</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
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

  // Calculate payment streak
  const getPaymentStreak = () => {
    if (!loans || loans.length === 0) return { currentStreak: 0, longestStreak: 0, neverMissed: false }

    // Get all paid schedules sorted by due date
    const allSchedules: any[] = []
    loans.forEach(loan => {
      if (loan.repayment_schedules) {
        loan.repayment_schedules.forEach((s: any) => {
          if (s.status === 'paid' && s.paid_at && s.due_date) {
            allSchedules.push(s)
          }
        })
      }
    })

    allSchedules.sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    let neverMissed = true

    allSchedules.forEach(schedule => {
      const dueDate = new Date(schedule.due_date)
      const paidDate = new Date(schedule.paid_at)

      if (paidDate <= dueDate) {
        tempStreak++
        if (currentStreak === 0 || tempStreak > 0) currentStreak++
      } else {
        neverMissed = false
        if (tempStreak > longestStreak) longestStreak = tempStreak
        tempStreak = 0
        currentStreak = 0
      }
    })

    if (tempStreak > longestStreak) longestStreak = tempStreak

    return { currentStreak, longestStreak, neverMissed }
  }

  // Calculate trust indicators
  const getTrustIndicators = () => {
    if (!borrower || !loans) return []

    const indicators: any[] = []
    const memberYears = differenceInYears(new Date(), new Date(borrower.created_at))
    const memberMonths = differenceInMonths(new Date(), new Date(borrower.created_at))
    const completedLoans = loans.filter(l => l.status === 'completed').length
    const defaultedLoans = loans.filter(l => l.status === 'defaulted').length
    const avgLoanSize = loans.length > 0 ? loans.reduce((sum, l) => sum + ((l.principal_minor || 0) / 100), 0) / loans.length : 0

    // Years as member
    if (memberYears >= 5) {
      indicators.push({ icon: Star, label: `${memberYears} Years Member`, color: 'text-yellow-600', bg: 'bg-yellow-50' })
    } else if (memberMonths >= 12) {
      indicators.push({ icon: Star, label: `${memberYears}+ Years Member`, color: 'text-yellow-600', bg: 'bg-yellow-50' })
    }

    // Completed loans
    if (completedLoans >= 20) {
      indicators.push({ icon: CheckCircle, label: `${completedLoans} Loans Completed`, color: 'text-green-600', bg: 'bg-green-50' })
    } else if (completedLoans >= 10) {
      indicators.push({ icon: CheckCircle, label: `${completedLoans} Loans Completed`, color: 'text-green-600', bg: 'bg-green-50' })
    } else if (completedLoans >= 5) {
      indicators.push({ icon: CheckCircle, label: `${completedLoans} Loans Completed`, color: 'text-blue-600', bg: 'bg-blue-50' })
    }

    // Zero defaults
    if (defaultedLoans === 0 && loans.length > 0) {
      indicators.push({ icon: Shield, label: 'Zero Defaults', color: 'text-emerald-600', bg: 'bg-emerald-50' })
    }

    // Payment streak
    const streak = getPaymentStreak()
    if (streak.neverMissed && loans.length > 0) {
      indicators.push({ icon: Flame, label: 'Never Missed Payment', color: 'text-orange-600', bg: 'bg-orange-50' })
    } else if (streak.currentStreak >= 12) {
      indicators.push({ icon: Flame, label: `${streak.currentStreak} Month Streak`, color: 'text-orange-600', bg: 'bg-orange-50' })
    }

    // Average loan size trend
    if (avgLoanSize >= 10000) {
      indicators.push({ icon: TrendingUp, label: 'High Value Borrower', color: 'text-purple-600', bg: 'bg-purple-50' })
    }

    return indicators
  }

  // Get repayment behavior data for graph
  const getRepaymentBehaviorData = () => {
    if (!loans || loans.length === 0) return []

    // Get all paid schedules
    const allSchedules: any[] = []
    loans.forEach(loan => {
      if (loan.repayment_schedules) {
        loan.repayment_schedules.forEach((s: any) => {
          if (s.status === 'paid' && s.paid_at && s.due_date) {
            allSchedules.push({
              ...s,
              loanId: loan.id,
              daysEarly: Math.floor((new Date(s.due_date).getTime() - new Date(s.paid_at).getTime()) / (1000 * 60 * 60 * 24))
            })
          }
        })
      }
    })

    // Sort by due date
    allSchedules.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

    // Group by month and calculate average
    const monthlyData: { [key: string]: { total: number, count: number, onTime: number } } = {}

    allSchedules.forEach(schedule => {
      const monthKey = format(new Date(schedule.due_date), 'MMM yyyy')
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, count: 0, onTime: 0 }
      }
      monthlyData[monthKey].total += schedule.daysEarly
      monthlyData[monthKey].count++
      if (schedule.daysEarly >= 0) monthlyData[monthKey].onTime++
    })

    // Convert to chart data
    return Object.keys(monthlyData).map(month => ({
      month,
      avgDaysEarly: Math.round(monthlyData[month].total / monthlyData[month].count),
      onTimeRate: Math.round((monthlyData[month].onTime / monthlyData[month].count) * 100),
      payments: monthlyData[month].count
    }))
  }

  // Get credit history timeline data
  const getCreditHistoryTimeline = () => {
    if (!loans || loans.length === 0) return []

    const events: any[] = []

    // Add loan creation events
    loans.forEach(loan => {
      events.push({
        date: new Date(loan.created_at),
        type: 'loan_created',
        label: 'Loan Created',
        amount: loan.principal_minor || 0,
        countryCode: loan.country_code,
        status: loan.status,
        loanId: loan.id
      })

      // Add loan completion
      if (loan.status === 'completed' && loan.repayment_schedules) {
        const lastPaid = loan.repayment_schedules
          .filter((s: any) => s.status === 'paid' && s.paid_at)
          .sort((a: any, b: any) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())[0]

        if (lastPaid) {
          events.push({
            date: new Date(lastPaid.paid_at),
            type: 'loan_completed',
            label: 'Loan Completed',
            amount: loan.principal_minor || 0,
            countryCode: loan.country_code,
            loanId: loan.id
          })
        }
      }
    })

    // Sort by date descending
    events.sort((a, b) => b.date.getTime() - a.date.getTime())

    return events.slice(0, 10) // Last 10 events
  }

  const handleSubmitReport = async () => {
    if (!reportType || !reportReason.trim()) {
      alert('Please fill in all required fields')
      return
    }

    if (!reportProofFile) {
      alert('Please upload proof document (receipt, screenshot, etc.)')
      return
    }

    try {
      setSubmittingReport(true)
      setUploadingProof(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('You must be logged in to submit a report')
        return
      }

      // Upload proof file to Supabase Storage
      const fileExt = reportProofFile.name.split('.').pop()
      const fileName = `${user.id}/${borrowerId}/${Date.now()}.${fileExt}`
      const filePath = `risk-evidence/${fileName}`

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('evidence')
        .upload(filePath, reportProofFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        throw new Error('Failed to upload proof document')
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('evidence')
        .getPublicUrl(filePath)

      setUploadingProof(false)

      // Compute hash of file for tamper detection
      const arrayBuffer = await reportProofFile.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const proofHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Create risk flag with file URL and hash
      const { error } = await supabase
        .from('risk_flags')
        .insert({
          borrower_id: borrowerId,
          country_code: borrower.country_code || 'GH',
          origin: 'LENDER_REPORTED',
          type: reportType,
          reason: reportReason,
          amount_at_issue_minor: reportAmount ? Math.round(parseFloat(reportAmount) * 100) : null,
          proof_url: publicUrl,
          proof_sha256: proofHash,
          created_by: user.id,
        })

      if (error) throw error

      alert('Risk report submitted successfully with proof document')
      setReportDialogOpen(false)
      setReportType('')
      setReportReason('')
      setReportAmount('')
      setReportProof('')
      setReportProofFile(null)

      // Reload data to show new flag
      loadBorrowerProfile()
    } catch (error) {
      console.error('Error submitting report:', error)
      alert('Failed to submit report. Please try again.')
    } finally {
      setSubmittingReport(false)
      setUploadingProof(false)
    }
  }

  const handleResolveFlag = async () => {
    if (!resolutionReason.trim()) {
      alert('Please provide a reason for resolving this flag')
      return
    }

    try {
      setResolvingFlag(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('You must be logged in to resolve a flag')
        return
      }

      // Update the risk flag to mark as resolved
      const { error } = await supabase
        .from('risk_flags')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_reason: resolutionReason,
        })
        .eq('id', selectedFlagToResolve.id)

      if (error) throw error

      alert('Flag resolved successfully. It will remain in history but marked as resolved.')
      setShowResolveDialog(false)
      setSelectedFlagToResolve(null)
      setResolutionReason('')

      // Reload data to show updated flag
      loadBorrowerProfile()
    } catch (error) {
      console.error('Error resolving flag:', error)
      alert('Failed to resolve flag. Please try again.')
    } finally {
      setResolvingFlag(false)
    }
  }

  const getRiskTypeBadge = (type: string) => {
    const badges: { [key: string]: { label: string; className: string } } = {
      'LATE_1_7': { label: 'Late 1-7 days', className: 'bg-yellow-100 text-yellow-800' },
      'LATE_8_30': { label: 'Late 8-30 days', className: 'bg-orange-100 text-orange-800' },
      'LATE_31_60': { label: 'Late 31-60 days', className: 'bg-red-100 text-red-800' },
      'DEFAULT': { label: 'Default', className: 'bg-red-600 text-white' },
      'CLEARED': { label: 'Cleared', className: 'bg-green-100 text-green-800' },
    }
    return badges[type] || { label: type, className: 'bg-gray-100 text-gray-800' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (!borrower) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Borrower not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  const overallAnalytics = getOverallPaymentAnalytics()
  const creditScore = borrower.borrower_scores?.[0]?.score || 500
  const disbursedStatuses = ['active', 'completed', 'defaulted', 'written_off']; const totalDisbursed = loans.filter(l => disbursedStatuses.includes(l.status)).reduce((sum, l) => sum + (l.principal_minor || 0), 0)
  const activeLoans = loans.filter(l => l.status === 'active').length
  const trustIndicators = getTrustIndicators()
  const paymentStreak = getPaymentStreak()
  const repaymentBehaviorData = getRepaymentBehaviorData()
  const creditTimeline = getCreditHistoryTimeline()

  // Check if this is a lender-tracked borrower (no self-verification status)
  const isTrackedBorrower = !borrower.borrower_self_verification_status || borrower.borrower_self_verification_status.length === 0

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      return
    }

    try {
      setSendingMessage(true)
      const { data, error } = await supabase.rpc('send_direct_message', {
        p_borrower_id: borrowerId,
        p_message: messageText.trim(),
        p_subject: messageSubject.trim() || null
      })

      if (error) throw error

      setMessageDialogOpen(false)
      setMessageText('')
      setMessageSubject('')
      router.push('/l/messages')
    } catch (error: any) {
      console.error('Error sending message:', JSON.stringify(error, null, 2))
      alert(error?.message || error?.details || error?.hint || JSON.stringify(error) || 'Failed to send message')
    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back Button and Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/l/borrowers')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Borrowers
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setMessageDialogOpen(true)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Message
          </Button>
          <Button
            onClick={() => router.push(`/l/borrowers/${borrowerId}/verify`)}
            className="bg-gradient-to-r from-primary to-secondary"
          >
            <FileCheck className="h-4 w-4 mr-2" />
            Verify Documents
          </Button>
        </div>
      </div>

      {/* Info: Only showing this lender's activity */}
      <Alert className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/30">
        <Shield className="h-4 w-4 text-primary" />
        <AlertDescription className="text-primary">
          <strong>Your Activity Only:</strong> This page shows only your lending activity with this borrower.
          To see their complete credit history from all lenders, search by National ID in the Borrowers page.
        </AlertDescription>
      </Alert>

      {/* Lender-Tracked Borrower Notice */}
      {isTrackedBorrower && (
        <Alert className="bg-blue-50 border-blue-200">
          <Users className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Lender-Tracked Borrower:</strong> This borrower was manually added to the system by a lender and has not self-registered.
            Some profile information may be limited.
          </AlertDescription>
        </Alert>
      )}

      {/* Header - Borrower Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-gray-900">{borrower.full_name}</h1>
                    {isTrackedBorrower && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                        <Users className="h-3 w-3 mr-1" />
                        Lender-Tracked
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-600">
                    {isTrackedBorrower ? 'Manually Added by Lender' : 'Complete Payment History & Profile'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{borrower.phone_e164}</span>
                </div>
                {borrower.email && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{borrower.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Member since {format(new Date(borrower.created_at), 'MMM yyyy')}</span>
                </div>
              </div>
            </div>

            <div className="text-right space-y-3">
              <div className="text-5xl font-bold">
                <span className={
                  creditScore >= 700 ? 'text-green-600' :
                  creditScore >= 600 ? 'text-yellow-600' :
                  creditScore >= 500 ? 'text-orange-600' : 'text-red-600'
                }>
                  {creditScore}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Credit Score</p>
              <Badge className="mt-2" variant={creditScore >= 700 ? 'default' : 'secondary'}>
                <TrendingUp className="h-3 w-3 mr-1" />
                {creditScore >= 700 ? 'Excellent' : creditScore >= 600 ? 'Good' : 'Fair'}
              </Badge>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setReportDialogOpen(true)}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Report This Borrower
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Verification Details - For Lender to Verify In Person */}
      <Card className="border-2 border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Shield className="h-5 w-5" />
            Full Verification Details
          </CardTitle>
          <CardDescription>
            Use this information to verify the borrower's identity in person. Compare what they tell you with what's recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal & Contact */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Full Name:</span>
                  <span className="font-medium">{borrower.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone:</span>
                  <span className="font-medium">{borrower.phone_e164}</span>
                </div>
                {borrower.date_of_birth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date of Birth:</span>
                    <span className="font-medium">{format(new Date(borrower.date_of_birth), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </div>

              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2 pt-2">
                <MapPin className="h-4 w-4" />
                Physical Address
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Street:</span>
                  <span className="font-medium">{borrower.street_address || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">City:</span>
                  <span className="font-medium">{borrower.city || 'N/A'}</span>
                </div>
                {borrower.postal_code && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Postal Code:</span>
                    <span className="font-medium">{borrower.postal_code}</span>
                  </div>
                )}
              </div>

              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2 pt-2">
                <Briefcase className="h-4 w-4" />
                Employment & Income
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-medium capitalize">{borrower.employment_status?.replace('_', ' ') || 'N/A'}</span>
                </div>
                {borrower.employer_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employer:</span>
                    <span className="font-medium">{borrower.employer_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Income Range:</span>
                  <span className="font-medium">{borrower.monthly_income_range || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Source:</span>
                  <span className="font-medium">{borrower.income_source || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Bank & Contacts */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Bank Account
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Bank:</span>
                  <span className="font-medium">{borrower.bank_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Account No:</span>
                  <span className="font-medium font-mono">{borrower.bank_account_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Account Name:</span>
                  <span className="font-medium">{borrower.bank_account_name || 'N/A'}</span>
                </div>
                {borrower.bank_account_name && borrower.full_name &&
                 borrower.bank_account_name.toLowerCase() !== borrower.full_name.toLowerCase() && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Account name doesn't match borrower name!
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2 pt-2">
                <Phone className="h-4 w-4" />
                Emergency Contact
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{borrower.emergency_contact_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone:</span>
                  <span className="font-medium">{borrower.emergency_contact_phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Relationship:</span>
                  <span className="font-medium capitalize">{borrower.emergency_contact_relationship || 'N/A'}</span>
                </div>
              </div>

              <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2 pt-2">
                <Users className="h-4 w-4" />
                Next of Kin
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{borrower.next_of_kin_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone:</span>
                  <span className="font-medium">{borrower.next_of_kin_phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Relationship:</span>
                  <span className="font-medium capitalize">{borrower.next_of_kin_relationship || 'N/A'}</span>
                </div>
              </div>

              {/* Social Media */}
              {(borrower.linkedin_url || borrower.facebook_url) && (
                <>
                  <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2 pt-2">
                    <LinkIcon className="h-4 w-4" />
                    Social Media
                  </h4>
                  <div className="space-y-2 text-sm">
                    {borrower.linkedin_url && (
                      <a href={borrower.linkedin_url} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-blue-600 hover:underline">
                        LinkedIn <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {borrower.facebook_url && (
                      <a href={borrower.facebook_url} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-blue-600 hover:underline">
                        Facebook <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <Alert className="mt-4 bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 text-sm">
              <strong>Verification Tip:</strong> Call the emergency contact and next of kin to verify the borrower's identity.
              Check that the bank account name matches the borrower's name exactly.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Risk Flags Alert */}
      {riskFlags.length > 0 && (
        <Alert variant="destructive" className="border-red-300 bg-red-50">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong>Warning:</strong> This borrower has {riskFlags.filter(f => !f.resolved_at).length} active risk flag(s)
                {riskFlags.filter(f => f.origin === 'LENDER_REPORTED').length > 0 && (
                  <span className="ml-2 text-sm">
                    (Reported by {new Set(riskFlags.filter(f => f.origin === 'LENDER_REPORTED').map(f => f.created_by)).size} lender{new Set(riskFlags.filter(f => f.origin === 'LENDER_REPORTED').map(f => f.created_by)).size !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Risk Flags Section */}
      {riskFlags.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <Flag className="h-5 w-5" />
                  Risk Flags & Reports
                </CardTitle>
                <CardDescription>
                  Payment issues and defaults reported by lenders or detected by system
                </CardDescription>
              </div>
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {riskFlags.filter(f => !f.resolved_at).length} Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskFlags.map((flag) => {
                const badge = getRiskTypeBadge(flag.type)
                const isResolved = !!flag.resolved_at
                const isDefault = flag.type === 'DEFAULT'

                return (
                  <div
                    key={flag.id}
                    className={`p-4 rounded-lg border-2 ${
                      isResolved
                        ? 'bg-gray-50 border-gray-200'
                        : isDefault
                        ? 'bg-red-50 border-red-300'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={badge.className}>
                            {badge.label}
                          </Badge>
                          <Badge variant={flag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                            {flag.origin === 'LENDER_REPORTED' ? (
                              <>
                                <Users className="h-3 w-3 mr-1" />
                                Lender Reported
                              </>
                            ) : (
                              'System Auto'
                            )}
                          </Badge>
                          {isResolved && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-900 font-medium mb-1">
                          {flag.reason}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-gray-600 mt-2">
                          <span>
                            Reported: {format(new Date(flag.created_at), 'MMM d, yyyy')}
                          </span>
                          {flag.amount_at_issue_minor && (
                            <span>
                              Amount: ${(flag.amount_at_issue_minor / 100).toFixed(2)}
                            </span>
                          )}
                          {flag.origin === 'LENDER_REPORTED' && (
                            <span>
                              By: {flag.lenders?.business_name || 'Unknown Lender'}
                            </span>
                          )}
                        </div>

                        {flag.resolved_at && (
                          <div className="mt-2 text-xs text-gray-500">
                            Resolved: {format(new Date(flag.resolved_at), 'MMM d, yyyy')}
                            {flag.resolution_reason && ` - ${flag.resolution_reason}`}
                          </div>
                        )}

                        {/* Action buttons for unresolved flags */}
                        {!isResolved && currentUserId && (
                          <div className="flex gap-2 mt-3">
                            {/* Only show "Mark as Resolved" if current lender created this flag */}
                            {flag.created_by === currentUserId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50"
                                onClick={() => {
                                  setSelectedFlagToResolve(flag)
                                  setShowResolveDialog(true)
                                }}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Mark as Resolved
                              </Button>
                            )}
                            {/* Show "Dispute" for flags created by other lenders */}
                            {flag.created_by !== currentUserId && flag.origin === 'LENDER_REPORTED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-700 border-orange-300 hover:bg-orange-50"
                                onClick={() => {
                                  alert('Dispute feature coming soon. Contact support with flag ID: ' + flag.id)
                                }}
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Dispute This Flag
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {isDefault && !isResolved && (
                        <div className="ml-4">
                          <Badge variant="destructive" className="text-xs">
                            HIGH RISK
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trust Indicators & Payment Streak */}
      {(trustIndicators.length > 0 || paymentStreak.longestStreak > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Trust Indicators */}
          {trustIndicators.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Trust Indicators
                </CardTitle>
                <CardDescription>Verified achievements and reputation markers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {trustIndicators.map((indicator, index) => {
                    const Icon = indicator.icon
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${indicator.bg} border border-gray-200`}
                      >
                        <Icon className={`h-4 w-4 ${indicator.color}`} />
                        <span className={`text-sm font-medium ${indicator.color}`}>
                          {indicator.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Streak */}
          {paymentStreak.longestStreak > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-600" />
                  Payment Streak
                </CardTitle>
                <CardDescription>Consecutive on-time payment record</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-red-50 rounded-lg border-2 border-orange-200">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Flame className="h-6 w-6 text-orange-600" />
                      <span className="text-3xl font-bold text-orange-600">
                        {paymentStreak.currentStreak}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Current Streak</p>
                    {paymentStreak.currentStreak > 0 && (
                      <p className="text-xs text-orange-600 mt-1">Active!</p>
                    )}
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Award className="h-6 w-6 text-purple-600" />
                      <span className="text-3xl font-bold text-purple-600">
                        {paymentStreak.longestStreak}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Longest Streak</p>
                    {paymentStreak.neverMissed && (
                      <p className="text-xs text-purple-600 mt-1">Perfect!</p>
                    )}
                  </div>
                </div>
                {paymentStreak.neverMissed && (
                  <Alert className="mt-3 bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <strong>Never missed a payment!</strong> This borrower has a perfect payment record.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Stats Overview - This Lender Only */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Your Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loans.length}</div>
            <p className="text-xs text-gray-500">{activeLoans} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Your Disbursement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDisbursed, borrower.country_code)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Payment Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              overallAnalytics.averageHealthScore >= 80 ? 'text-green-600' :
              overallAnalytics.averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {overallAnalytics.averageHealthScore}%
            </div>
            <p className="text-xs text-gray-500">Average score</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">On-Time Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              overallAnalytics.onTimePaymentRate >= 80 ? 'text-green-600' :
              overallAnalytics.onTimePaymentRate >= 60 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {overallAnalytics.onTimePaymentRate}%
            </div>
            <p className="text-xs text-gray-500">{overallAnalytics.totalOnTime} on-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit History Timeline - This Lender Only */}
      {creditTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Your Loan Activity Timeline</CardTitle>
            </div>
            <CardDescription>Chronological view of your lending activities with this borrower</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              {/* Timeline Events */}
              <div className="space-y-6">
                {creditTimeline.map((event, index) => (
                  <div key={index} className="relative flex gap-4 items-start">
                    {/* Timeline Dot */}
                    <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      event.type === 'loan_completed' ? 'bg-green-100' :
                      event.type === 'loan_created' ? 'bg-blue-100' : 'bg-gray-100'
                    } border-4 border-white`}>
                      {event.type === 'loan_completed' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : event.type === 'loan_created' ? (
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      )}
                    </div>

                    {/* Event Card */}
                    <div className="flex-1 pb-4">
                      <div className={`p-4 rounded-lg border-2 ${
                        event.type === 'loan_completed' ? 'bg-green-50 border-green-200' :
                        event.type === 'loan_created' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{event.label}</h4>
                          <span className="text-sm text-gray-500">{format(event.date, 'MMM dd, yyyy')}</span>
                        </div>
                        <p className="text-sm text-gray-700">
                          {formatCurrency(event.amount, event.countryCode)}
                          {event.status && event.type === 'loan_created' && (
                            <Badge className="ml-2" variant={
                              event.status === 'completed' ? 'default' :
                              event.status === 'active' ? 'secondary' : 'outline'
                            }>
                              {event.status}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repayment Behavior Graph - This Lender Only */}
      {repaymentBehaviorData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Repayment Behavior with You</CardTitle>
            </div>
            <CardDescription>
              Payment timing patterns for loans you've provided to this borrower
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={repaymentBehaviorData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" label={{ value: 'Days Early/Late', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'On-Time Rate (%)', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgDaysEarly"
                  stroke="#3b82f6"
                  name="Avg Days Early"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="onTimeRate"
                  stroke="#22c55e"
                  name="On-Time Rate"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {repaymentBehaviorData.reduce((sum, d) => sum + d.avgDaysEarly, 0) / repaymentBehaviorData.length > 0 ? '+' : ''}
                  {Math.round(repaymentBehaviorData.reduce((sum, d) => sum + d.avgDaysEarly, 0) / repaymentBehaviorData.length)}
                </p>
                <p className="text-xs text-gray-600">Avg Days Early</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {Math.round(repaymentBehaviorData.reduce((sum, d) => sum + d.onTimeRate, 0) / repaymentBehaviorData.length)}%
                </p>
                <p className="text-xs text-gray-600">Overall On-Time</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {repaymentBehaviorData.reduce((sum, d) => sum + d.payments, 0)}
                </p>
                <p className="text-xs text-gray-600">Total Payments</p>
              </div>
            </div>
            <Alert className="mt-4 bg-blue-50 border-blue-200">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {repaymentBehaviorData[repaymentBehaviorData.length - 1].avgDaysEarly > 0 ? (
                  <><strong>Positive trend!</strong> Recent payments are consistently early, showing strong financial discipline.</>
                ) : (
                  <><strong>Monitor required.</strong> Recent payment timing suggests closer tracking may be needed.</>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Overall Payment History Summary - This Lender Only */}
      {loans.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle>Payment History with You</CardTitle>
            </div>
            <CardDescription>
              Payment performance for loans you've provided to this borrower
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Circular Chart */}
              <div className="flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={250}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    data={getRadialChartData(overallAnalytics.onTimePaymentRate, overallAnalytics.averageHealthScore)}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background
                      dataKey="value"
                      cornerRadius={10}
                    />
                    <Tooltip />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center -mt-8">
                  <p className="text-4xl font-bold">
                    {overallAnalytics.onTimePaymentRate}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">On-Time Payment Rate</p>
                  <Badge className="mt-2" variant={
                    overallAnalytics.averageHealthScore >= 80 ? 'default' :
                    overallAnalytics.averageHealthScore >= 60 ? 'secondary' : 'destructive'
                  }>
                    <Award className="h-3 w-3 mr-1" />
                    Health Score: {overallAnalytics.averageHealthScore}%
                  </Badge>
                </div>
              </div>

              {/* Payment Statistics */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-900">{overallAnalytics.totalOnTime}</p>
                      <p className="text-sm text-green-700">On-Time Payments</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-900">{overallAnalytics.totalLate}</p>
                      <p className="text-sm text-yellow-700">Late Payments</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-900">{overallAnalytics.totalOverdue}</p>
                      <p className="text-sm text-red-700">Overdue</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <CreditCard className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-900">{overallAnalytics.totalPaid}</p>
                      <p className="text-sm text-blue-700">Total Paid</p>
                    </div>
                  </div>
                </div>

                <Alert className={
                  overallAnalytics.averageHealthScore >= 80 ? 'bg-green-50 border-green-200' :
                  overallAnalytics.averageHealthScore >= 60 ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }>
                  <Shield className={`h-4 w-4 ${
                    overallAnalytics.averageHealthScore >= 80 ? 'text-green-600' :
                    overallAnalytics.averageHealthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`} />
                  <AlertDescription>
                    <strong>
                      {overallAnalytics.averageHealthScore >= 80 ? 'Excellent Borrower' :
                       overallAnalytics.averageHealthScore >= 60 ? 'Good Borrower' : 'Caution Advised'}
                    </strong>
                    <br />
                    {overallAnalytics.averageHealthScore >= 80 ? 'Strong payment history with consistent on-time payments. Low risk.' :
                     overallAnalytics.averageHealthScore >= 60 ? 'Decent payment history with some delays. Moderate risk.' :
                     'Poor payment history with frequent late or missed payments. High risk.'}
                  </AlertDescription>
                </Alert>

                <Alert className="bg-blue-50 border-blue-200">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong>Permanent Record:</strong> This history stays forever and is used for automatic risk flagging.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Loans Section - Show loans waiting for action */}
      {loans.filter(l => ['pending_offer', 'pending_signatures'].includes(l.status)).length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-amber-800 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Loans ({loans.filter(l => ['pending_offer', 'pending_signatures'].includes(l.status)).length})
            </CardTitle>
            <CardDescription>Loans awaiting action (not yet tracked in repayment system)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loans.filter(l => ['pending_offer', 'pending_signatures'].includes(l.status)).map((loan) => (
                <div key={loan.id} className="flex items-center justify-between p-4 bg-white rounded-lg border">
                  <div>
                    <p className="font-medium">{formatCurrency(loan.principal_minor || 0, loan.country_code)}</p>
                    <p className="text-sm text-gray-500">{loan.term_months} months @ {((loan.apr_bps || 0) / 100).toFixed(2)}% APR</p>
                    <p className="text-xs text-gray-400 mt-1">Created {format(new Date(loan.created_at), 'MMM dd, yyyy')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(loan.status)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/l/loans/${loan.id}`)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Your Active/Tracked Loans with this Borrower */}
      <Card>
        <CardHeader>
          <CardTitle>Your Loans with This Borrower ({loans.filter(l => ['active', 'completed', 'defaulted', 'written_off'].includes(l.status)).length})</CardTitle>
          <CardDescription>Loan history between you and this borrower (tracked loans only)</CardDescription>
        </CardHeader>
        <CardContent>
          {loans.filter(l => ['active', 'completed', 'defaulted', 'written_off'].includes(l.status)).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">No active or completed loans with this borrower yet</p>
              <Button onClick={() => router.push(`/l/loans/new?borrower=${borrowerId}`)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Create New Loan
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {loans.filter(l => ['active', 'completed', 'defaulted', 'written_off'].includes(l.status)).map((loan) => {
                const analytics = getPaymentAnalytics(loan)
                return (
                  <Card key={loan.id} className="border-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {formatCurrency(loan.principal_minor || 0, loan.country_code)} Loan
                          </CardTitle>
                          <CardDescription>
                            {loan.term_months} months @ {((loan.apr_bps || 0) / 100).toFixed(2)}% APR
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(loan.status)}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/l/loans/${loan.id}`)}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Small Circular Chart */}
                        <div className="flex flex-col items-center justify-center">
                          <ResponsiveContainer width="100%" height={180}>
                            <RadialBarChart
                              cx="50%"
                              cy="50%"
                              innerRadius="60%"
                              outerRadius="100%"
                              data={getRadialChartData(analytics.progressPercentage, analytics.paymentHealthScore)}
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
                          <div className="text-center -mt-6">
                            <p className="text-2xl font-bold">{analytics.progressPercentage}%</p>
                            <p className="text-xs text-gray-600">Complete</p>
                            <Badge className="mt-1" variant={
                              analytics.paymentHealthScore >= 80 ? 'default' :
                              analytics.paymentHealthScore >= 60 ? 'secondary' : 'destructive'
                            }>
                              Health: {analytics.paymentHealthScore}%
                            </Badge>
                          </div>
                        </div>

                        {/* Payment Stats */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.onTimePayments}</p>
                                <p className="text-xs text-gray-600">On-Time</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.latePayments}</p>
                                <p className="text-xs text-gray-600">Late</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <Target className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.pendingPayments}</p>
                                <p className="text-xs text-gray-600">Pending</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <div>
                                <p className="text-lg font-bold">{analytics.overduePayments}</p>
                                <p className="text-xs text-gray-600">Overdue</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Lender: {loan.lenders?.business_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Created: {format(new Date(loan.created_at), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Private Lender Notes */}
      <Card className="border-2 border-purple-200 bg-purple-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-600" />
            <CardTitle>Private Lender Notes</CardTitle>
          </div>
          <CardDescription>
            Internal notes visible only to you - observations, promises, concerns (Not yet saved to database)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              placeholder="Add your private notes about this borrower...
Examples:
• Met in person, seems reliable
• Referred by John from XYZ Bank
• Mentioned planning to expand business next quarter
• Prefers communication via WhatsApp"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <Alert className="flex-1 mr-4 bg-blue-50 border-blue-200">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800">
                  <strong>Private & Secure:</strong> These notes are only visible to your lender account and never shared with the borrower or other lenders.
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => {
                  setSavingNotes(true)
                  // TODO: Implement save to database when table is created
                  setTimeout(() => {
                    setSavingNotes(false)
                    alert('Note: Database integration coming soon. Notes are not persisted yet.')
                  }, 500)
                }}
                disabled={savingNotes || !notes.trim()}
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Borrower Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-900">
              <Flag className="h-5 w-5" />
              Report Risk Flag
            </DialogTitle>
            <DialogDescription>
              Report a payment issue or default for {borrower.full_name}. This will be visible to other lenders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="risk-type">Risk Type *</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="risk-type">
                  <SelectValue placeholder="Select risk type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LATE_1_7">Late 1-7 days</SelectItem>
                  <SelectItem value="LATE_8_30">Late 8-30 days</SelectItem>
                  <SelectItem value="LATE_31_60">Late 31-60 days</SelectItem>
                  <SelectItem value="DEFAULT">Default (Loan not repaid)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason / Description *</Label>
              <Textarea
                id="reason"
                placeholder="Describe the issue (e.g., 'Loan defaulted after 3 months, borrower unreachable')"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount Involved (Optional)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={reportAmount}
                onChange={(e) => setReportAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proof-file">Proof Document * (Required)</Label>
              <Input
                id="proof-file"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    // Check file size (max 5MB)
                    if (file.size > 5 * 1024 * 1024) {
                      alert('File size must be less than 5MB')
                      e.target.value = ''
                      return
                    }
                    setReportProofFile(file)
                  }
                }}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500">
                Upload proof (receipt, screenshot, messages, etc.) - Max 5MB, images or PDF
              </p>
              {reportProofFile && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <FileText className="h-4 w-4" />
                  <span>Selected: {reportProofFile.name}</span>
                </div>
              )}
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Important:</strong> Proof document is required for verification. File will be stored securely and visible to admins for dispute resolution. False reporting may result in account suspension.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReportDialogOpen(false)
                setReportType('')
                setReportReason('')
                setReportAmount('')
                setReportProof('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReport}
              disabled={submittingReport || !reportType || !reportReason.trim() || !reportProofFile}
              className="bg-red-600 hover:bg-red-700"
            >
              {uploadingProof ? 'Uploading Proof...' : submittingReport ? 'Submitting Report...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Flag Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="h-5 w-5" />
              Mark Flag as Resolved
            </DialogTitle>
            <DialogDescription>
              Mark this flag as resolved if the borrower has paid back what they owed. The flag will remain in history but marked as resolved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedFlagToResolve && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-sm text-blue-900">
                  <strong>Resolving:</strong> {selectedFlagToResolve.reason}
                  <br />
                  <strong>Type:</strong> {getRiskTypeBadge(selectedFlagToResolve.type).label}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="resolution-reason">Resolution Reason *</Label>
              <Textarea
                id="resolution-reason"
                placeholder="Example: Borrower paid back full amount on [date]"
                value={resolutionReason}
                onChange={(e) => setResolutionReason(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-gray-500">
                Explain why this flag is being resolved (e.g., payment received, issue resolved)
              </p>
            </div>

            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-xs text-yellow-900">
                <strong>Important:</strong> This flag will NOT be deleted. It will remain visible in the borrower's history but marked as "Resolved" with your explanation. This maintains transparency for other lenders.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResolveDialog(false)
                setSelectedFlagToResolve(null)
                setResolutionReason('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveFlag}
              disabled={resolvingFlag || !resolutionReason.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {resolvingFlag ? 'Resolving...' : 'Mark as Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Send Message to {borrower.full_name}
            </DialogTitle>
            <DialogDescription>
              Start a direct conversation with this borrower. They will be notified of your message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="message-subject">Subject (optional)</Label>
              <Input
                id="message-subject"
                placeholder="e.g., Question about your loan request"
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message-text">Message *</Label>
              <Textarea
                id="message-text"
                placeholder="Type your message here..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={5}
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Never share sensitive information like passwords, PINs, or bank account details. Messages are monitored for security.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMessageDialogOpen(false)
                setMessageText('')
                setMessageSubject('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sendingMessage || !messageText.trim()}
            >
              {sendingMessage ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
