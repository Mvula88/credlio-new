'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Landmark,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  DollarSign,
  Crown,
  ArrowRight,
  Link as LinkIcon,
  Pause,
  Play,
  Ban,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface CollectionStats {
  active_mandates: number
  pending_consent: number
  total_collected_this_month: number
  successful_this_month: number
  failed_this_month: number
  upcoming_deductions: number
  next_deduction_date: string | null
}

const DEFAULT_CURRENCY = 'NAD'

interface PaymentMandate {
  id: string
  mandate_reference: string
  amount: number
  currency: string
  frequency: string
  deduction_day: number
  start_date: string
  status: string
  consent_token: string | null
  loan: {
    id: string
    borrower: {
      full_name: string
    }
  }
}

export default function CollectionsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [mandates, setMandates] = useState<PaymentMandate[]>([])
  const [lenderTier, setLenderTier] = useState<string>('FREE')
  const supabase = createClient()

  useEffect(() => {
    checkTierAndLoadData()
  }, [])

  const checkTierAndLoadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please log in to access Collections')
        return
      }

      // Check tier
      const { data: tierData } = await supabase.rpc('get_effective_tier', {
        p_user_id: user.id
      })

      if (tierData) {
        setLenderTier(tierData)
      }

      if (tierData !== 'BUSINESS') {
        setLoading(false)
        return
      }

      // Load stats
      const { data: statsData, error: statsError } = await supabase.rpc('get_collection_stats', {
        p_user_id: user.id
      })

      if (statsError) {
        console.error('Error loading stats:', statsError)
        toast.error('Failed to load collection stats')
      } else {
        setStats(statsData)
      }

      // Load mandates
      const { data: mandatesData, error: mandatesError } = await supabase
        .from('payment_mandates')
        .select(`
          id,
          mandate_reference,
          amount,
          currency,
          frequency,
          deduction_day,
          start_date,
          status,
          consent_token,
          loan:loans(
            id,
            borrower:borrowers(full_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (mandatesError) {
        console.error('Error loading mandates:', mandatesError)
        toast.error('Failed to load payment mandates')
      } else {
        setMandates(mandatesData || [])
      }

    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
      pending_consent: { label: 'Pending Consent', variant: 'secondary', icon: AlertCircle },
      active: { label: 'Active', variant: 'default', icon: CheckCircle2 },
      paused: { label: 'Paused', variant: 'outline', icon: Pause },
      cancelled_borrower: { label: 'Cancelled by Borrower', variant: 'destructive', icon: XCircle },
      cancelled_lender: { label: 'Cancelled by Lender', variant: 'destructive', icon: XCircle },
      completed: { label: 'Completed', variant: 'outline', icon: CheckCircle2 },
      expired: { label: 'Expired', variant: 'outline', icon: Ban },
    }

    const config = statusConfig[status] || { label: status, variant: 'outline', icon: AlertCircle }
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      weekly: 'Weekly',
      biweekly: 'Every 2 Weeks',
      monthly: 'Monthly',
      custom: 'Custom'
    }
    return labels[frequency] || frequency
  }

  const copyConsentLink = (token: string) => {
    const link = `${window.location.origin}/consent/${token}`
    navigator.clipboard.writeText(link)
    toast.success('Consent link copied to clipboard!')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading Collections...</p>
        </div>
      </div>
    )
  }

  // Not Business tier - show upgrade prompt
  if (lenderTier !== 'BUSINESS') {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-2 border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Collections Feature</CardTitle>
            <CardDescription className="text-base">
              Upgrade to Business Plan to unlock automatic payment collections
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                What's Included:
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Automatic Card Deductions</strong> - Set up recurring payments from borrower cards</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Borrower Consent Management</strong> - Send secure consent links to borrowers</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Automated Split Payments</strong> - Platform fee deducted, you receive the rest</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Payment Tracking</strong> - Real-time transaction monitoring and reports</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Flexible Schedules</strong> - Weekly, bi-weekly, or monthly deductions</span>
                </li>
              </ul>
            </div>

            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Plus all PRO features: Unlimited searches, document verification, analytics, and more
              </p>
              <Link href="/l/billing">
                <Button size="lg" className="gap-2">
                  <Crown className="h-5 w-5" />
                  Upgrade to Business Plan
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Business tier - show Collections dashboard
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Collections</h1>
          <p className="text-muted-foreground mt-1">Manage automatic payment deductions from borrowers</p>
        </div>
        <Badge variant="default" className="gap-1">
          <Crown className="h-3 w-3" />
          Business Feature
        </Badge>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Mandates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold">{stats.active_mandates}</p>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.pending_consent} pending consent
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Collected This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold">{DEFAULT_CURRENCY} {Number(stats.total_collected_this_month).toFixed(2)}</p>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.successful_this_month} successful transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold">
                  {stats.successful_this_month + stats.failed_this_month > 0
                    ? Math.round((stats.successful_this_month / (stats.successful_this_month + stats.failed_this_month)) * 100)
                    : 0}%
                </p>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.failed_this_month} failed this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold">{stats.upcoming_deductions}</p>
                <Calendar className="h-8 w-8 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.next_deduction_date
                  ? `Next: ${format(new Date(stats.next_deduction_date), 'MMM dd, yyyy')}`
                  : 'None scheduled'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Mandates List */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Mandates</CardTitle>
          <CardDescription>Active and pending automatic payment deductions</CardDescription>
        </CardHeader>
        <CardContent>
          {mandates.length === 0 ? (
            <div className="text-center py-12">
              <Landmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Payment Mandates Yet</h3>
              <p className="text-muted-foreground mb-6">
                Set up automatic deductions on your active loans to start collecting payments automatically
              </p>
              <Link href="/l/loans">
                <Button className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  View Loans
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {mandates.map((mandate) => (
                <div
                  key={mandate.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">{mandate.loan?.borrower?.full_name || 'Unknown Borrower'}</h4>
                        {getStatusBadge(mandate.status)}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Reference</p>
                          <p className="font-mono font-semibold">{mandate.mandate_reference}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-semibold">{mandate.currency} {mandate.amount.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Frequency</p>
                          <p>{getFrequencyLabel(mandate.frequency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Start Date</p>
                          <p>{format(new Date(mandate.start_date), 'MMM dd, yyyy')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {mandate.status === 'pending_consent' && mandate.consent_token && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyConsentLink(mandate.consent_token!)}
                          className="gap-2"
                        >
                          <LinkIcon className="h-4 w-4" />
                          Copy Link
                        </Button>
                      )}
                      <Link href={`/l/loans/${mandate.loan?.id}`}>
                        <Button variant="outline" size="sm">
                          View Loan
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
