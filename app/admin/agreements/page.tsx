'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileSignature, Search, Loader2, Download, Eye, Calendar, DollarSign, User, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'

export default function AdminAgreementsPage() {
  const [loading, setLoading] = useState(true)
  const [agreements, setAgreements] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAgreement, setSelectedAgreement] = useState<any>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadAgreements()
  }, [])

  const loadAgreements = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('loan_agreements')
        .select(`
          *,
          loans!inner (
            id,
            principal_minor,
            apr_bps,
            term_months,
            currency,
            status,
            start_date,
            end_date,
            lender_id,
            borrower_id,
            country_code
          )
        `)
        .order('generated_at', { ascending: false })

      if (error) throw error

      setAgreements(data || [])
    } catch (error) {
      console.error('Error loading agreements:', error)
      toast.error('Failed to load loan agreements')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadAgreement = async (agreementId: string, loanId: string) => {
    try {
      setDownloadingId(agreementId)

      const response = await fetch(`/api/loans/agreement?loanId=${loanId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to download agreement')
      }

      const htmlContent = await response.text()

      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `loan-agreement-${loanId}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast.success('Agreement downloaded successfully')
    } catch (error: any) {
      console.error('Error downloading agreement:', error)
      toast.error(error.message || 'Failed to download agreement')
    } finally {
      setDownloadingId(null)
    }
  }

  const handlePreviewAgreement = (agreement: any) => {
    setSelectedAgreement(agreement)
    setShowPreviewDialog(true)
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
    const variants: Record<string, string> = {
      'active': 'bg-green-100 text-green-800',
      'completed': 'bg-blue-100 text-blue-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'defaulted': 'bg-red-100 text-red-800',
    }
    return variants[status] || 'bg-gray-100 text-gray-800'
  }

  const filteredAgreements = agreements.filter(agreement => {
    const searchLower = searchTerm.toLowerCase()
    return (
      agreement.lender_name?.toLowerCase().includes(searchLower) ||
      agreement.borrower_name?.toLowerCase().includes(searchLower) ||
      agreement.loan_id?.toLowerCase().includes(searchLower) ||
      agreement.loans?.country_code?.toLowerCase().includes(searchLower)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileSignature className="h-8 w-8 text-primary" />
          Loan Agreements
        </h1>
        <p className="text-muted-foreground mt-1">
          View and manage all generated loan agreements across the platform
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Agreements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agreements.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {agreements.filter(a => a.loans?.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {agreements.filter(a => a.loans?.status === 'completed').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                agreements.reduce((sum, a) => sum + (a.principal_minor || 0), 0),
                agreements[0]?.loans?.country_code
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Agreements</CardTitle>
          <CardDescription>Filter by lender, borrower, loan ID, or country</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agreements..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Agreements Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Loan Agreements ({filteredAgreements.length})</CardTitle>
          <CardDescription>
            Complete list of generated loan agreements with download access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Generated</TableHead>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>APR</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Downloads</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgreements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No agreements found matching your search' : 'No loan agreements yet'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAgreements.map((agreement) => (
                    <TableRow key={agreement.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {format(new Date(agreement.generated_at), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {agreement.loan_id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{agreement.lender_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{agreement.borrower_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(agreement.principal_minor, agreement.loans?.country_code)}
                      </TableCell>
                      <TableCell>
                        {(agreement.apr_bps / 100).toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        {agreement.term_months} mo
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(agreement.loans?.status)}>
                          {agreement.loans?.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{agreement.loans?.country_code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {agreement.lender_downloaded_at && (
                            <div>L: {format(new Date(agreement.lender_downloaded_at), 'MMM dd')}</div>
                          )}
                          {agreement.borrower_downloaded_at && (
                            <div>B: {format(new Date(agreement.borrower_downloaded_at), 'MMM dd')}</div>
                          )}
                          {!agreement.lender_downloaded_at && !agreement.borrower_downloaded_at && (
                            <div className="text-yellow-600">Not downloaded</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreviewAgreement(agreement)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleDownloadAgreement(agreement.id, agreement.loan_id)}
                            disabled={downloadingId === agreement.id}
                          >
                            {downloadingId === agreement.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agreement Preview</DialogTitle>
            <DialogDescription>
              Loan Agreement for {selectedAgreement?.borrower_name}
            </DialogDescription>
          </DialogHeader>
          {selectedAgreement && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Lender</p>
                  <p className="font-medium">{selectedAgreement.lender_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedAgreement.lender_address}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Borrower</p>
                  <p className="font-medium">{selectedAgreement.borrower_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedAgreement.borrower_address}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Principal</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(selectedAgreement.principal_minor, selectedAgreement.loans?.country_code)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">APR</p>
                  <p className="text-lg font-bold">
                    {(selectedAgreement.apr_bps / 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Term</p>
                  <p className="text-lg font-bold">{selectedAgreement.term_months} months</p>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Agreement Period</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">Start Date</p>
                    <p className="text-sm">{format(new Date(selectedAgreement.start_date), 'MMMM dd, yyyy')}</p>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div>
                    <p className="text-sm font-medium">End Date</p>
                    <p className="text-sm">{format(new Date(selectedAgreement.end_date), 'MMMM dd, yyyy')}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Generated</p>
                <p className="text-sm">{format(new Date(selectedAgreement.generated_at), 'MMMM dd, yyyy HH:mm')}</p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    handleDownloadAgreement(selectedAgreement.id, selectedAgreement.loan_id)
                    setShowPreviewDialog(false)
                  }}
                  disabled={downloadingId === selectedAgreement.id}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Agreement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
