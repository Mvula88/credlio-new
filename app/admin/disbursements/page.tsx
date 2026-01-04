'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Banknote,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  ExternalLink,
  RefreshCw
} from 'lucide-react'
import { format } from 'date-fns'
import { formatCurrencyByCountry } from '@/lib/utils/currency'

type DisbursementStatus = 'all' | 'pending' | 'confirmed' | 'disputed'

export default function AdminDisbursementsPage() {
  const [disbursements, setDisbursements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<DisbursementStatus>('all')
  const [selectedDisbursement, setSelectedDisbursement] = useState<any>(null)
  const [detailsDialog, setDetailsDialog] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadDisbursements()
  }, [])

  const loadDisbursements = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('disbursement_proofs')
        .select(`
          *,
          loans(
            id,
            principal_minor,
            currency,
            country_code,
            status,
            lender_id,
            borrower_id,
            borrowers(full_name, phone_e164),
            lenders(business_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDisbursements(data || [])
    } catch (error) {
      console.error('Error loading disbursements:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (d: any) => {
    if (d.borrower_disputed) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Disputed</Badge>
    }
    if (d.borrower_confirmed) {
      return <Badge className="bg-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Confirmed</Badge>
    }
    if (d.lender_submitted_at) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" />Awaiting Confirmation</Badge>
    }
    return <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" />Pending</Badge>
  }

  const filteredDisbursements = disbursements.filter(d => {
    // Status filter
    if (statusFilter === 'disputed' && !d.borrower_disputed) return false
    if (statusFilter === 'confirmed' && !d.borrower_confirmed) return false
    if (statusFilter === 'pending' && (d.borrower_confirmed || d.borrower_disputed)) return false

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const borrowerName = d.loans?.borrowers?.full_name?.toLowerCase() || ''
      const lenderName = d.loans?.lenders?.business_name?.toLowerCase() || ''
      const loanId = d.loan_id?.toLowerCase() || ''
      const reference = d.lender_proof_reference?.toLowerCase() || ''

      return borrowerName.includes(search) ||
             lenderName.includes(search) ||
             loanId.includes(search) ||
             reference.includes(search)
    }
    return true
  })

  const stats = {
    total: disbursements.length,
    pending: disbursements.filter(d => !d.borrower_confirmed && !d.borrower_disputed && d.lender_submitted_at).length,
    confirmed: disbursements.filter(d => d.borrower_confirmed).length,
    disputed: disbursements.filter(d => d.borrower_disputed).length,
    awaitingProof: disbursements.filter(d => !d.lender_submitted_at).length
  }

  const openDetails = (d: any) => {
    setSelectedDisbursement(d)
    setDetailsDialog(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Disbursements</h1>
          <p className="text-muted-foreground">Monitor loan disbursements and payment confirmations</p>
        </div>
        <Button onClick={loadDisbursements} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.awaitingProof}</div>
            <p className="text-xs text-muted-foreground">Awaiting Proof</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending Confirmation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <p className="text-xs text-muted-foreground">Confirmed</p>
          </CardContent>
        </Card>
        <Card className={stats.disputed > 0 ? 'border-red-200 bg-red-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.disputed}</div>
            <p className="text-xs text-muted-foreground">Disputed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            All Disbursements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by borrower, lender, loan ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DisbursementStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending Confirmation</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisbursements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No disbursements found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDisbursements.map((d) => (
                    <TableRow key={d.id} className={d.borrower_disputed ? 'bg-red-50' : ''}>
                      <TableCell className="font-mono text-xs">
                        {d.loan_id?.slice(0, 8)}...
                      </TableCell>
                      <TableCell>{d.loans?.lenders?.business_name || 'N/A'}</TableCell>
                      <TableCell>{d.loans?.borrowers?.full_name || 'N/A'}</TableCell>
                      <TableCell className="font-medium">
                        {d.lender_proof_amount
                          ? formatCurrencyByCountry(d.lender_proof_amount * 100, d.loans?.country_code)
                          : 'Not submitted'}
                      </TableCell>
                      <TableCell className="capitalize">
                        {d.lender_proof_method?.replace('_', ' ') || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(d)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.lender_submitted_at
                          ? format(new Date(d.lender_submitted_at), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openDetails(d)}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialog} onOpenChange={setDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Disbursement Details</DialogTitle>
            <DialogDescription>
              Loan ID: {selectedDisbursement?.loan_id}
            </DialogDescription>
          </DialogHeader>

          {selectedDisbursement && (
            <div className="space-y-4">
              {/* Status Banner */}
              {selectedDisbursement.borrower_disputed && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-900 font-semibold">
                    <AlertTriangle className="h-5 w-5" />
                    DISPUTED
                  </div>
                  <p className="text-sm text-red-800 mt-1">
                    <strong>Reason:</strong> {selectedDisbursement.borrower_dispute_reason || 'Not specified'}
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    Disputed on: {selectedDisbursement.borrower_disputed_at
                      ? format(new Date(selectedDisbursement.borrower_disputed_at), 'MMM d, yyyy HH:mm')
                      : 'Unknown'}
                  </p>
                </div>
              )}

              {selectedDisbursement.borrower_confirmed && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-900 font-semibold">
                    <CheckCircle className="h-5 w-5" />
                    CONFIRMED
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    Confirmed on: {selectedDisbursement.borrower_confirmed_at
                      ? format(new Date(selectedDisbursement.borrower_confirmed_at), 'MMM d, yyyy HH:mm')
                      : 'Unknown'}
                  </p>
                </div>
              )}

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">LENDER</h4>
                  <p className="font-medium">{selectedDisbursement.loans?.lenders?.business_name || 'N/A'}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-muted-foreground mb-2">BORROWER</h4>
                  <p className="font-medium">{selectedDisbursement.loans?.borrowers?.full_name || 'N/A'}</p>
                  <p className="text-sm text-muted-foreground">{selectedDisbursement.loans?.borrowers?.phone_e164 || ''}</p>
                </div>
              </div>

              {/* Loan Details */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-sm text-blue-900 mb-2">LOAN AMOUNT</h4>
                <p className="text-2xl font-bold text-blue-900">
                  {formatCurrencyByCountry(selectedDisbursement.loans?.principal_minor || 0, selectedDisbursement.loans?.country_code)}
                </p>
                <p className="text-sm text-blue-700">Loan Status: {selectedDisbursement.loans?.status}</p>
              </div>

              {/* Disbursement Proof */}
              {selectedDisbursement.lender_submitted_at ? (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold">Lender's Proof of Payment</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Amount Sent:</span>
                      <p className="font-medium">
                        {formatCurrencyByCountry((selectedDisbursement.lender_proof_amount || 0) * 100, selectedDisbursement.loans?.country_code)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Method:</span>
                      <p className="font-medium capitalize">{selectedDisbursement.lender_proof_method?.replace('_', ' ') || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reference:</span>
                      <p className="font-medium font-mono">{selectedDisbursement.lender_proof_reference || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date Submitted:</span>
                      <p className="font-medium">
                        {format(new Date(selectedDisbursement.lender_submitted_at), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                  {selectedDisbursement.lender_proof_notes && (
                    <div>
                      <span className="text-muted-foreground text-sm">Notes:</span>
                      <p className="text-sm">{selectedDisbursement.lender_proof_notes}</p>
                    </div>
                  )}
                  {selectedDisbursement.lender_proof_url && (
                    <a
                      href={selectedDisbursement.lender_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Proof Document
                    </a>
                  )}
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Lender has not submitted proof of payment yet</p>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => window.open(`/admin/borrowers/${selectedDisbursement.loans?.borrower_id}`, '_blank')}
                >
                  View Borrower
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`/admin/lenders/${selectedDisbursement.loans?.lender_id}`, '_blank')}
                >
                  View Lender
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
