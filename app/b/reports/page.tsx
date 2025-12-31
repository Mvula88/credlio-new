'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  Eye
} from 'lucide-react'

interface Report {
  id: string
  borrower_id: string
  lender_id: string
  country_code: string
  currency: string
  amount_minor: number
  loan_date: string
  due_date: string | null
  status: 'unpaid' | 'paid' | 'disputed' | 'overdue'
  payment_date: string | null
  description: string | null
  evidence_urls: string[] | null
  borrower_confirmed: boolean
  borrower_response: string | null
  created_at: string
  lender: {
    user_id: string
    business_name: string
  }
}

const statusConfig = {
  unpaid: { label: 'Unpaid', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Paid', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  disputed: { label: 'Disputed', icon: AlertCircle, color: 'bg-red-100 text-red-800' },
  overdue: { label: 'Overdue', icon: XCircle, color: 'bg-red-100 text-red-800' }
}

export default function BorrowerReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showDisputeDialog, setShowDisputeDialog] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      const response = await fetch('/api/reports')
      const data = await response.json()

      if (response.ok) {
        setReports(data.reports || [])
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      console.error('Error loading reports:', error)
      setError('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPayment = async () => {
    if (!selectedReport || !paymentDate) {
      setError('Please provide payment date')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const apiResponse = await fetch('/api/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          action: 'confirm_payment',
          paymentDate,
          response: response || null
        })
      })

      const data = await apiResponse.json()

      if (!apiResponse.ok) {
        throw new Error(data.error || 'Failed to confirm payment')
      }

      setSuccess('Payment confirmed successfully')
      setShowConfirmDialog(false)
      setPaymentDate('')
      setResponse('')
      loadReports()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDispute = async () => {
    if (!selectedReport || !response) {
      setError('Please provide a reason for the dispute')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const apiResponse = await fetch('/api/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          action: 'dispute',
          response
        })
      })

      const data = await apiResponse.json()

      if (!apiResponse.ok) {
        throw new Error(data.error || 'Failed to dispute report')
      }

      setSuccess('Dispute submitted successfully. An admin will review your case.')
      setShowDisputeDialog(false)
      setResponse('')
      loadReports()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const unpaidReports = reports.filter(r => r.status === 'unpaid' || r.status === 'overdue')
  const resolvedReports = reports.filter(r => r.status === 'paid' || r.status === 'disputed')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Reports</h1>
        <p className="text-gray-600 mt-1">View and respond to payment reports from lenders</p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Warning for unpaid reports */}
      {unpaidReports.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Action Required</AlertTitle>
          <AlertDescription>
            You have {unpaidReports.length} unpaid report{unpaidReports.length > 1 ? 's' : ''}.
            Please review and respond to improve your credit score.
          </AlertDescription>
        </Alert>
      )}

      {/* Unpaid Reports */}
      {unpaidReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unpaid Reports ({unpaidReports.length})</CardTitle>
            <CardDescription>Reports requiring your attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {unpaidReports.map((report) => {
              const StatusIcon = statusConfig[report.status].icon
              return (
                <Card key={report.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{report.lender.business_name}</h3>
                          <Badge className={statusConfig[report.status].color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig[report.status].label}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            <strong>Amount:</strong>{' '}
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: report.currency
                            }).format(report.amount_minor / 100)}
                          </p>
                          <p>
                            <strong>Loan Date:</strong>{' '}
                            {new Date(report.loan_date).toLocaleDateString()}
                          </p>
                          {report.due_date && (
                            <p>
                              <strong>Due Date:</strong>{' '}
                              {new Date(report.due_date).toLocaleDateString()}
                            </p>
                          )}
                          {report.description && (
                            <p className="mt-2">
                              <strong>Details:</strong> {report.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedReport(report)
                            setShowDetailsDialog(true)
                          }}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report)
                            setPaymentDate(new Date().toISOString().split('T')[0])
                            setShowConfirmDialog(true)
                          }}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Confirm Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedReport(report)
                            setShowDisputeDialog(true)
                          }}
                        >
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Dispute
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Resolved Reports */}
      {resolvedReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved Reports ({resolvedReports.length})</CardTitle>
            <CardDescription>Past reports that have been resolved</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resolvedReports.map((report) => {
              const StatusIcon = statusConfig[report.status].icon
              return (
                <Card key={report.id} className="bg-gray-50">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{report.lender.business_name}</h3>
                          <Badge className={statusConfig[report.status].color}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusConfig[report.status].label}
                          </Badge>
                          {report.borrower_confirmed && (
                            <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <p>
                            <strong>Amount:</strong>{' '}
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: report.currency
                            }).format(report.amount_minor / 100)}
                          </p>
                          {report.payment_date && (
                            <p>
                              <strong>Payment Date:</strong>{' '}
                              {new Date(report.payment_date).toLocaleDateString()}
                            </p>
                          )}
                          {report.borrower_response && (
                            <p className="mt-2">
                              <strong>Your Response:</strong> {report.borrower_response}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {reports.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No reports yet</h3>
            <p className="mt-2 text-gray-600">
              You don't have any payment reports. This is good for your credit score!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Details Dialog */}
      {selectedReport && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Lender</Label>
                <p className="text-sm">{selectedReport.lender.business_name}</p>
              </div>
              <div>
                <Label>Amount</Label>
                <p className="text-sm">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: selectedReport.currency
                  }).format(selectedReport.amount_minor / 100)}
                </p>
              </div>
              <div>
                <Label>Loan Date</Label>
                <p className="text-sm">{new Date(selectedReport.loan_date).toLocaleDateString()}</p>
              </div>
              {selectedReport.due_date && (
                <div>
                  <Label>Due Date</Label>
                  <p className="text-sm">{new Date(selectedReport.due_date).toLocaleDateString()}</p>
                </div>
              )}
              {selectedReport.description && (
                <div>
                  <Label>Description</Label>
                  <p className="text-sm">{selectedReport.description}</p>
                </div>
              )}
              <div>
                <Label>Status</Label>
                <Badge className={statusConfig[selectedReport.status].color}>
                  {statusConfig[selectedReport.status].label}
                </Badge>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Payment Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Confirm that you have paid this debt
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Additional Details (Optional)</Label>
              <Textarea
                placeholder="E.g., Payment method, transaction reference..."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmPayment} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                'Confirm Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Report</DialogTitle>
            <DialogDescription>
              Explain why this report is inaccurate or unfair
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Disputed reports will be reviewed by an admin. Make sure to provide clear details.
              </AlertDescription>
            </Alert>
            <div>
              <Label>Reason for Dispute *</Label>
              <Textarea
                placeholder="Explain why this report is incorrect..."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisputeDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleDispute} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Dispute'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
