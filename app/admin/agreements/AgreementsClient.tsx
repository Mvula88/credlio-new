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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileSignature, Search, Loader2, Download, Eye, Calendar, User, Building2, CheckCircle, Clock, ExternalLink, FileText, Shield, AlertTriangle, Image } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export default function AgreementsClient() {
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

        // Admin badge
        pdf.setFontSize(8)
        pdf.setTextColor(100, 100, 100)
        pdf.text('ADMIN COPY', 10, 10)

        // Footer
        pdf.setFontSize(10)
        pdf.setTextColor(150, 150, 150)
        pdf.text('Powered by Credlio - Secure Lending Platform', imgWidth / 2, pageHeight - 10, { align: 'center' })

        // Page number
        pdf.setFontSize(9)
        pdf.text(`Page ${i} of ${totalPages}`, imgWidth - 15, pageHeight - 10, { align: 'right' })
      }

      // Download the PDF
      pdf.save(`loan-agreement-${loanId}-admin.pdf`)

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
      agreement.loan_id?.toLowerCase().includes(searchLower)
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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Fully Signed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {agreements.filter(a => a.fully_signed).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {agreements.length > 0 ? Math.round((agreements.filter(a => a.fully_signed).length / agreements.length) * 100) : 0}% complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {agreements.filter(a => a.loans?.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
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
          <CardDescription>Filter by loan ID</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Loan ID..."
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
                  <TableHead>Signatures</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgreements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
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
                        <div className="space-y-1">
                          {/* Fully Signed Badge */}
                          {agreement.fully_signed ? (
                            <Badge className="bg-green-600 text-white text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Fully Signed
                            </Badge>
                          ) : (
                            <div className="space-y-1">
                              {/* Lender Signature Status */}
                              <div className="flex items-center gap-1 text-xs">
                                {agreement.lender_signed_at ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <span className="text-green-600">L: Signed</span>
                                    {agreement.lender_signed_url && (
                                      <a
                                        href={agreement.lender_signed_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                        title="View lender's signed copy"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 text-gray-400" />
                                    <span className="text-gray-500">L: Pending</span>
                                  </>
                                )}
                              </div>

                              {/* Borrower Signature Status */}
                              <div className="flex items-center gap-1 text-xs">
                                {agreement.borrower_signed_at ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <span className="text-green-600">B: Signed</span>
                                    {agreement.borrower_signed_url && (
                                      <a
                                        href={agreement.borrower_signed_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                        title="View borrower's signed copy"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 text-gray-400" />
                                    <span className="text-gray-500">B: Pending</span>
                                  </>
                                )}
                              </div>
                            </div>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              Agreement Review
            </DialogTitle>
            <DialogDescription>
              Review all documents for Loan #{selectedAgreement?.loan_id?.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedAgreement && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="generated">
                  Generated Agreement
                </TabsTrigger>
                <TabsTrigger value="lender-signed" className="relative">
                  Lender's Copy
                  {selectedAgreement.lender_signed_at && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="borrower-signed" className="relative">
                  Borrower's Copy
                  {selectedAgreement.borrower_signed_at && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Signature Status Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className={selectedAgreement.fully_signed ? 'border-green-500 bg-green-50' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Agreement Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAgreement.fully_signed ? (
                        <Badge className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Fully Executed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending Signatures
                        </Badge>
                      )}
                      {selectedAgreement.fully_signed_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Completed: {format(new Date(selectedAgreement.fully_signed_at), 'MMM dd, yyyy HH:mm')}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className={selectedAgreement.lender_signed_at ? 'border-green-300' : 'border-yellow-300'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Lender Signature
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAgreement.lender_signed_at ? (
                        <>
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Signed
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(new Date(selectedAgreement.lender_signed_at), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-yellow-700">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </CardContent>
                  </Card>

                  <Card className={selectedAgreement.borrower_signed_at ? 'border-green-300' : 'border-yellow-300'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Borrower Signature
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAgreement.borrower_signed_at ? (
                        <>
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Signed
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(new Date(selectedAgreement.borrower_signed_at), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-yellow-700">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Parties Info */}
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

                {/* Loan Terms */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
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
                  <div>
                    <p className="text-sm text-muted-foreground">Loan Status</p>
                    <Badge className={getStatusBadge(selectedAgreement.loans?.status)}>
                      {selectedAgreement.loans?.status}
                    </Badge>
                  </div>
                </div>

                {/* Agreement Period */}
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

                {/* Hash Verification */}
                {(selectedAgreement.agreement_hash || selectedAgreement.lender_signed_hash || selectedAgreement.borrower_signed_hash) && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Document Integrity Verification
                    </p>
                    <div className="space-y-2 text-xs font-mono">
                      {selectedAgreement.agreement_hash && (
                        <div>
                          <span className="text-muted-foreground">Generated: </span>
                          <span className="text-blue-700">{selectedAgreement.agreement_hash.slice(0, 16)}...</span>
                        </div>
                      )}
                      {selectedAgreement.lender_signed_hash && (
                        <div>
                          <span className="text-muted-foreground">Lender Upload: </span>
                          <span className="text-blue-700">{selectedAgreement.lender_signed_hash.slice(0, 16)}...</span>
                        </div>
                      )}
                      {selectedAgreement.borrower_signed_hash && (
                        <div>
                          <span className="text-muted-foreground">Borrower Upload: </span>
                          <span className="text-blue-700">{selectedAgreement.borrower_signed_hash.slice(0, 16)}...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Generated Agreement Tab */}
              <TabsContent value="generated" className="space-y-4 mt-4">
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    This is the system-generated loan agreement. Download to review the full document with Credlio watermark.
                  </AlertDescription>
                </Alert>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Generated Agreement</CardTitle>
                    <CardDescription>
                      Created on {format(new Date(selectedAgreement.generated_at), 'MMMM dd, yyyy HH:mm')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-10 w-10 text-blue-600" />
                        <div>
                          <p className="font-medium">Loan Agreement (PDF)</p>
                          <p className="text-sm text-muted-foreground">
                            System generated with Credlio watermark
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDownloadAgreement(selectedAgreement.id, selectedAgreement.loan_id)}
                        disabled={downloadingId === selectedAgreement.id}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {downloadingId === selectedAgreement.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Lender's Signed Copy Tab */}
              <TabsContent value="lender-signed" className="space-y-4 mt-4">
                {selectedAgreement.lender_signed_at ? (
                  <>
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-900">
                        Lender uploaded their signed copy on {format(new Date(selectedAgreement.lender_signed_at), 'MMMM dd, yyyy HH:mm')}
                      </AlertDescription>
                    </Alert>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Lender's Signed Agreement
                        </CardTitle>
                        <CardDescription>
                          Uploaded by: {selectedAgreement.lender_name}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedAgreement.lender_signed_url ? (
                          <div className="space-y-4">
                            {/* Preview if it's an image */}
                            {(selectedAgreement.lender_signed_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                              <div className="border rounded-lg p-2 bg-gray-50">
                                <img
                                  src={selectedAgreement.lender_signed_url}
                                  alt="Lender's signed agreement"
                                  className="max-w-full max-h-96 mx-auto object-contain"
                                />
                              </div>
                            )}

                            <div className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center gap-3">
                                {selectedAgreement.lender_signed_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                  <Image className="h-10 w-10 text-green-600" />
                                ) : (
                                  <FileText className="h-10 w-10 text-green-600" />
                                )}
                                <div>
                                  <p className="font-medium">Lender's Signed Copy</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedAgreement.lender_signed_url.split('/').pop()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => window.open(selectedAgreement.lender_signed_url, '_blank')}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  onClick={() => {
                                    const link = document.createElement('a')
                                    link.href = selectedAgreement.lender_signed_url
                                    link.download = `lender-signed-${selectedAgreement.loan_id}.${selectedAgreement.lender_signed_url.split('.').pop()}`
                                    link.click()
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                              </div>
                            </div>

                            {selectedAgreement.lender_signed_hash && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">File Hash: </span>
                                <span className="font-mono">{selectedAgreement.lender_signed_hash}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>Signed but file URL not available</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-900">
                      Lender has not yet uploaded their signed copy of the agreement.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              {/* Borrower's Signed Copy Tab */}
              <TabsContent value="borrower-signed" className="space-y-4 mt-4">
                {selectedAgreement.borrower_signed_at ? (
                  <>
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-900">
                        Borrower uploaded their signed copy on {format(new Date(selectedAgreement.borrower_signed_at), 'MMMM dd, yyyy HH:mm')}
                      </AlertDescription>
                    </Alert>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Borrower's Signed Agreement
                        </CardTitle>
                        <CardDescription>
                          Uploaded by: {selectedAgreement.borrower_name}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedAgreement.borrower_signed_url ? (
                          <div className="space-y-4">
                            {/* Preview if it's an image */}
                            {(selectedAgreement.borrower_signed_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) && (
                              <div className="border rounded-lg p-2 bg-gray-50">
                                <img
                                  src={selectedAgreement.borrower_signed_url}
                                  alt="Borrower's signed agreement"
                                  className="max-w-full max-h-96 mx-auto object-contain"
                                />
                              </div>
                            )}

                            <div className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center gap-3">
                                {selectedAgreement.borrower_signed_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                  <Image className="h-10 w-10 text-green-600" />
                                ) : (
                                  <FileText className="h-10 w-10 text-green-600" />
                                )}
                                <div>
                                  <p className="font-medium">Borrower's Signed Copy</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedAgreement.borrower_signed_url.split('/').pop()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => window.open(selectedAgreement.borrower_signed_url, '_blank')}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  onClick={() => {
                                    const link = document.createElement('a')
                                    link.href = selectedAgreement.borrower_signed_url
                                    link.download = `borrower-signed-${selectedAgreement.loan_id}.${selectedAgreement.borrower_signed_url.split('.').pop()}`
                                    link.click()
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                              </div>
                            </div>

                            {selectedAgreement.borrower_signed_hash && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">File Hash: </span>
                                <span className="font-mono">{selectedAgreement.borrower_signed_hash}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>Signed but file URL not available</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-900">
                      Borrower has not yet uploaded their signed copy of the agreement.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
