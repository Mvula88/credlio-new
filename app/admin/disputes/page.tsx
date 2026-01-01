'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Scale,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  User,
  DollarSign,
  Calendar,
  Flag,
  ArrowUpCircle,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  MessageSquare,
  Shield
} from 'lucide-react'
import { format, differenceInHours, isPast } from 'date-fns'

export default function DisputesPage() {
  const [loading, setLoading] = useState(true)
  const [disputes, setDisputes] = useState<any[]>([])
  const [selectedDispute, setSelectedDispute] = useState<any>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolutionAction, setResolutionAction] = useState('')
  const [assigningTo, setAssigningTo] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const supabase = createClient()

  useEffect(() => {
    loadDisputes()
  }, [statusFilter, priorityFilter])

  const loadDisputes = async () => {
    try {
      let query = supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error loading disputes:', error)
        return
      }

      // Fetch related data separately for each dispute
      const disputesWithDetails = await Promise.all(
        (data || []).map(async (dispute: any) => {
          const enrichedDispute: any = { ...dispute }

          // Get loan info if loan_id exists
          if (dispute.loan_id) {
            const { data: loanData } = await supabase
              .from('loans')
              .select('id, borrower_id, lender_id, amount_minor')
              .eq('id', dispute.loan_id)
              .single()

            if (loanData) {
              enrichedDispute.loans = loanData

              // Get borrower info
              const { data: borrowerData } = await supabase
                .from('borrowers')
                .select('full_name, phone_e164')
                .eq('id', loanData.borrower_id)
                .single()

              if (borrowerData) {
                enrichedDispute.loans.borrowers = borrowerData
              }

              // Get lender info
              const { data: lenderData } = await supabase
                .from('lenders')
                .select('business_name')
                .eq('user_id', loanData.lender_id)
                .single()

              if (lenderData) {
                enrichedDispute.loans.lenders = lenderData
              }
            }
          }

          // Get loan request info if request_id exists
          if (dispute.request_id) {
            const { data: requestData } = await supabase
              .from('loan_requests')
              .select('id, purpose, amount_minor, borrower_id')
              .eq('id', dispute.request_id)
              .single()

            if (requestData) {
              enrichedDispute.loan_requests = requestData

              // Get borrower info from request
              const { data: borrowerData } = await supabase
                .from('borrowers')
                .select('full_name')
                .eq('id', requestData.borrower_id)
                .single()

              if (borrowerData) {
                enrichedDispute.loan_requests.borrowers = borrowerData
              }
            }
          }

          return enrichedDispute
        })
      )

      setDisputes(disputesWithDetails || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateDisputeStatus = async (disputeId: string, status: string) => {
    try {
      const updates: any = { status }

      if (status.startsWith('resolved')) {
        updates.resolved_at = new Date().toISOString()
        updates.resolution_notes = resolutionNote
        updates.resolution_action = resolutionAction
      }

      const { error } = await supabase
        .from('disputes')
        .update(updates)
        .eq('id', disputeId)

      if (error) {
        console.error('Error updating dispute:', error)
        return
      }

      await loadDisputes()
      setSelectedDispute(null)
      setResolutionNote('')
      setResolutionAction('')
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const assignDispute = async (disputeId: string, adminId: string | null) => {
    try {
      const { error } = await supabase
        .from('disputes')
        .update({ assigned_to_admin: adminId })
        .eq('id', disputeId)

      if (error) {
        console.error('Error assigning dispute:', error)
        return
      }

      await loadDisputes()
      setAssigningTo(null)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const escalateDispute = async (disputeId: string) => {
    try {
      const { error } = await supabase
        .from('disputes')
        .update({
          status: 'escalated',
          priority: 'critical'
        })
        .eq('id', disputeId)

      if (error) {
        console.error('Error escalating dispute:', error)
        return
      }

      await loadDisputes()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'under_review':
        return 'bg-blue-100 text-blue-800'
      case 'awaiting_evidence':
        return 'bg-purple-100 text-purple-800'
      case 'resolved_in_favor_borrower':
      case 'resolved_in_favor_lender':
        return 'bg-green-100 text-green-800'
      case 'closed_no_action':
        return 'bg-gray-100 text-gray-800'
      case 'escalated':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getSLAStatus = (dispute: any) => {
    if (!dispute.sla_due_date) return null

    const dueDate = new Date(dispute.sla_due_date)
    const hoursRemaining = differenceInHours(dueDate, new Date())

    if (isPast(dueDate)) {
      return { label: 'OVERDUE', color: 'text-red-600', hours: Math.abs(hoursRemaining) }
    } else if (hoursRemaining < 24) {
      return { label: 'URGENT', color: 'text-orange-600', hours: hoursRemaining }
    } else {
      return { label: 'ON TRACK', color: 'text-green-600', hours: hoursRemaining }
    }
  }

  const stats = {
    pending: disputes.filter(d => d.status === 'pending').length,
    underReview: disputes.filter(d => d.status === 'under_review').length,
    awaitingEvidence: disputes.filter(d => d.status === 'awaiting_evidence').length,
    resolved: disputes.filter(d => d.status?.startsWith('resolved')).length,
    escalated: disputes.filter(d => d.status === 'escalated').length,
    overdueSLA: disputes.filter(d => {
      if (!d.sla_due_date) return false
      return isPast(new Date(d.sla_due_date))
    }).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Dispute Resolution Center</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Manage and resolve platform disputes • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-yellow-600">{stats.pending}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Under Review</CardTitle>
            <Eye className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-blue-600">{stats.underReview}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Awaiting Evidence</CardTitle>
            <FileText className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-purple-600">{stats.awaitingEvidence}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-600">{stats.resolved}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Escalated</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-red-600">{stats.escalated}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Overdue SLA</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-red-600">{stats.overdueSLA}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="awaiting_evidence">Awaiting Evidence</SelectItem>
                  <SelectItem value="resolved_in_favor_borrower">Resolved (Borrower)</SelectItem>
                  <SelectItem value="resolved_in_favor_lender">Resolved (Lender)</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disputes List */}
      <Card>
        <CardHeader>
          <CardTitle>All Disputes</CardTitle>
          <CardDescription>
            {disputes.length} dispute{disputes.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disputes.length === 0 ? (
            <div className="text-center py-12">
              <Scale className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No disputes found</p>
              <p className="text-sm text-gray-500 mt-2">Disputes will appear here when users report issues</p>
            </div>
          ) : (
            <div className="space-y-4">
              {disputes.map((dispute) => {
                const slaStatus = getSLAStatus(dispute)
                return (
                  <Card key={dispute.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <CardTitle className="text-lg">
                              Dispute #{dispute.dispute_number || dispute.id.slice(0, 8)}
                            </CardTitle>
                            <Badge className={getStatusColor(dispute.status)}>
                              {dispute.status?.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            <Badge className={getPriorityColor(dispute.priority)}>
                              {dispute.priority?.toUpperCase()}
                            </Badge>
                          </div>
                          <CardDescription>{dispute.title || dispute.reason}</CardDescription>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-sm text-gray-600">
                            Filed by: <span className="font-medium">{dispute.filed_by}</span>
                          </p>
                          {slaStatus && (
                            <div className="flex items-center space-x-1">
                              <Clock className={`h-3 w-3 ${slaStatus.color}`} />
                              <p className={`text-xs font-medium ${slaStatus.color}`}>
                                {slaStatus.label} ({Math.floor(slaStatus.hours)}h)
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Type</p>
                          <p className="font-medium">{dispute.dispute_type || 'General'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Amount</p>
                          <p className="font-medium">
                            ${((dispute.amount_disputed_minor || 0) / 100).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Created</p>
                          <p className="font-medium">{format(new Date(dispute.created_at), 'MMM dd, yyyy')}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">SLA Due</p>
                          <p className="font-medium">
                            {dispute.sla_due_date ? format(new Date(dispute.sla_due_date), 'MMM dd, HH:mm') : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {dispute.description && (
                        <Alert>
                          <MessageSquare className="h-4 w-4" />
                          <AlertDescription>{dispute.description}</AlertDescription>
                        </Alert>
                      )}

                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDispute(dispute)}
                        >
                          <Eye className="mr-2 h-3 w-3" />
                          Review
                        </Button>
                        {dispute.status !== 'escalated' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => escalateDispute(dispute.id)}
                          >
                            <ArrowUpCircle className="mr-2 h-3 w-3" />
                            Escalate
                          </Button>
                        )}
                        {!dispute.status?.startsWith('resolved') && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setSelectedDispute(dispute)
                              setResolutionAction('resolve')
                            }}
                          >
                            <CheckCircle className="mr-2 h-3 w-3" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispute Detail Dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={() => setSelectedDispute(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Dispute #{selectedDispute?.dispute_number || selectedDispute?.id?.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              Review dispute details and take action
            </DialogDescription>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-600">Status</Label>
                  <Badge className={getStatusColor(selectedDispute.status)}>
                    {selectedDispute.status?.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Priority</Label>
                  <Badge className={getPriorityColor(selectedDispute.priority)}>
                    {selectedDispute.priority?.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Filed By</Label>
                  <p className="font-medium">{selectedDispute.filed_by}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Type</Label>
                  <p className="font-medium">{selectedDispute.dispute_type || 'General'}</p>
                </div>
              </div>

              {selectedDispute.description && (
                <div>
                  <Label className="text-xs text-gray-600">Description</Label>
                  <p className="mt-1 p-3 bg-gray-50 rounded-lg">{selectedDispute.description}</p>
                </div>
              )}

              {resolutionAction === 'resolve' && (
                <>
                  <div className="space-y-2">
                    <Label>Resolution Action</Label>
                    <Select onValueChange={setResolutionAction}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select resolution action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved_in_favor_borrower">Resolve in favor of Borrower</SelectItem>
                        <SelectItem value="resolved_in_favor_lender">Resolve in favor of Lender</SelectItem>
                        <SelectItem value="closed_no_action">Close without action</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Resolution Notes</Label>
                    <Textarea
                      placeholder="Explain the resolution decision..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      rows={4}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectedDispute(null)
              setResolutionAction('')
              setResolutionNote('')
            }}>
              Cancel
            </Button>
            {resolutionAction && resolutionAction !== 'resolve' && (
              <Button
                onClick={() => updateDisputeStatus(selectedDispute.id, resolutionAction)}
                disabled={!resolutionNote}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Confirm Resolution
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
