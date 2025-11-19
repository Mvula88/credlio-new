'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  UserCheck,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Ban,
  Loader2,
  FileText,
  Camera,
  AlertCircle,
  Shield
} from 'lucide-react'
import { format } from 'date-fns'

export default function KYCVerificationPage() {
  const [loading, setLoading] = useState(true)
  const [verifications, setVerifications] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [selectedVerification, setSelectedVerification] = useState<any>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [approving, setApproving] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    banned: 0,
    todayApproved: 0,
  })
  const supabase = createClient()

  useEffect(() => {
    loadKYCData()
  }, [])

  const loadKYCData = async () => {
    try {
      // Load all verification statuses
      const { data: verificationsData } = await supabase
        .from('borrower_self_verification_status')
        .select(`
          *,
          borrowers (
            full_name,
            country_code,
            phone_e164,
            created_at
          )
        `)
        .order('updated_at', { ascending: false })

      setVerifications(verificationsData || [])

      // Calculate stats
      const today = new Date().toISOString().split('T')[0]
      const totalCount = verificationsData?.length || 0
      const approvedCount = verificationsData?.filter(v => v.verification_status === 'approved').length || 0
      const pendingCount = verificationsData?.filter(v => v.verification_status === 'pending').length || 0
      const rejectedCount = verificationsData?.filter(v => v.verification_status === 'rejected').length || 0
      const bannedCount = verificationsData?.filter(v => v.verification_status === 'banned').length || 0
      const todayApprovedCount = verificationsData?.filter(v =>
        v.verification_status === 'approved' &&
        v.verified_at &&
        v.verified_at.startsWith(today)
      ).length || 0

      setStats({
        total: totalCount,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        banned: bannedCount,
        todayApproved: todayApprovedCount,
      })
    } catch (error) {
      console.error('Error loading KYC data:', error)
    } finally {
      setLoading(false)
    }
  }

  const viewDetails = async (verification: any) => {
    try {
      // Load documents for this borrower
      const { data: docs } = await supabase
        .from('borrower_documents')
        .select('*')
        .eq('borrower_id', verification.borrower_id)
        .order('uploaded_at', { ascending: false })

      setDocuments(docs || [])
      setSelectedVerification(verification)
      setAdminNotes(verification.admin_notes || '')
      setShowDetailsModal(true)
    } catch (error) {
      console.error('Error loading verification details:', error)
    }
  }

  const handleApprove = async () => {
    if (!selectedVerification) return

    try {
      setApproving(true)

      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('borrower_self_verification_status')
        .update({
          verification_status: 'approved',
          auto_approved: false,
          admin_override: true,
          admin_override_by: user!.id,
          admin_override_at: new Date().toISOString(),
          admin_notes: adminNotes,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedVerification.id)

      if (error) {
        alert('Failed to approve: ' + error.message)
        return
      }

      alert('Borrower approved successfully!')
      setShowDetailsModal(false)
      loadKYCData()
    } catch (error) {
      console.error('Error approving:', error)
      alert('Failed to approve borrower')
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!selectedVerification) return

    if (!adminNotes || adminNotes.trim().length < 10) {
      alert('Please provide a detailed rejection reason (at least 10 characters)')
      return
    }

    try {
      setApproving(true)

      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('borrower_self_verification_status')
        .update({
          verification_status: 'rejected',
          auto_rejected: false,
          admin_override: true,
          admin_override_by: user!.id,
          admin_override_at: new Date().toISOString(),
          admin_notes: adminNotes,
          rejection_reason: adminNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedVerification.id)

      if (error) {
        alert('Failed to reject: ' + error.message)
        return
      }

      alert('Borrower rejected successfully!')
      setShowDetailsModal(false)
      loadKYCData()
    } catch (error) {
      console.error('Error rejecting:', error)
      alert('Failed to reject borrower')
    } finally {
      setApproving(false)
    }
  }

  const getStatusBadge = (status: string, autoApproved?: boolean, autoRejected?: boolean) => {
    const isAuto = autoApproved || autoRejected
    const prefix = isAuto ? '🤖 ' : ''

    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">{prefix}Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">{prefix}Rejected</Badge>
      case 'banned':
        return <Badge className="bg-red-900 text-white">🚫 Banned</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">⏳ Pending</Badge>
      case 'incomplete':
        return <Badge className="bg-gray-100 text-gray-600">📝 Incomplete</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getRiskBadge = (score: number) => {
    if (score <= 30) {
      return <Badge className="bg-green-100 text-green-800">Low ({score})</Badge>
    } else if (score <= 60) {
      return <Badge className="bg-yellow-100 text-yellow-800">Medium ({score})</Badge>
    } else {
      return <Badge className="bg-red-100 text-red-800">High ({score})</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading verification data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">KYC Verification</h1>
            <p className="text-white/90 text-lg font-medium drop-shadow">
              Smart automated verification system • {format(new Date(), 'MMMM dd, yyyy')}
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg">
            <p className="text-white text-sm">Today: <strong>+{stats.todayApproved}</strong> verified</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total</CardTitle>
            <Shield className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{stats.total}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none bg-green-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-green-700 uppercase tracking-wide">Approved</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-green-600">{stats.approved}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none bg-yellow-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-yellow-700 uppercase tracking-wide">Pending</CardTitle>
            <Clock className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-yellow-600">{stats.pending}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none bg-red-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-red-700 uppercase tracking-wide">Rejected</CardTitle>
            <XCircle className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-600">{stats.rejected}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none bg-red-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-white uppercase tracking-wide">Banned</CardTitle>
            <Ban className="h-5 w-5 text-white" />
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-white">{stats.banned}</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">Pending Review ({stats.pending})</TabsTrigger>
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({stats.approved})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Verifications - Manual Review Required</CardTitle>
            </CardHeader>
            <CardContent>
              {verifications.filter(v => v.verification_status === 'pending').length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">No pending verifications!</p>
                  <p className="text-sm text-gray-500 mt-2">All submissions are being handled automatically.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verifications.filter(v => v.verification_status === 'pending').map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar>
                              <AvatarFallback>{v.borrowers?.full_name?.charAt(0) || 'B'}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{v.borrowers?.full_name}</p>
                              <p className="text-xs text-muted-foreground">{v.borrowers?.phone_e164}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{v.borrowers?.country_code}</TableCell>
                        <TableCell>{getRiskBadge(v.overall_risk_score)}</TableCell>
                        <TableCell>
                          <span className={v.documents_uploaded >= 2 ? 'text-green-600 font-medium' : 'text-yellow-600'}>
                            {v.documents_uploaded}/{v.documents_required}
                          </span>
                        </TableCell>
                        <TableCell>{format(new Date(v.updated_at), 'MMM dd, HH:mm')}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => viewDetails(v)} variant="outline">
                            <Eye className="mr-1 h-3 w-3" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Verifications</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verifications.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarFallback>{v.borrowers?.full_name?.charAt(0) || 'B'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{v.borrowers?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{v.borrowers?.country_code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(v.verification_status, v.auto_approved, v.auto_rejected)}
                      </TableCell>
                      <TableCell>{getRiskBadge(v.overall_risk_score)}</TableCell>
                      <TableCell>{v.documents_uploaded}/{v.documents_required}</TableCell>
                      <TableCell>{format(new Date(v.updated_at), 'MMM dd, HH:mm')}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => viewDetails(v)} variant="outline">
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle>Approved Verifications</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verifications.filter(v => v.verification_status === 'approved').map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarFallback>{v.borrowers?.full_name?.charAt(0) || 'B'}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{v.borrowers?.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(v.verification_status, v.auto_approved, v.auto_rejected)}
                      </TableCell>
                      <TableCell>{getRiskBadge(v.overall_risk_score)}</TableCell>
                      <TableCell>
                        {v.verified_at ? format(new Date(v.verified_at), 'MMM dd, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => viewDetails(v)} variant="outline">
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verification Details</DialogTitle>
            <DialogDescription>
              Review borrower documents and metadata
            </DialogDescription>
          </DialogHeader>

          {selectedVerification && (
            <div className="space-y-6">
              {/* Borrower Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-semibold">{selectedVerification.borrowers?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-semibold">{selectedVerification.borrowers?.phone_e164}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(
                    selectedVerification.verification_status,
                    selectedVerification.auto_approved,
                    selectedVerification.auto_rejected
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Risk Score</p>
                  {getRiskBadge(selectedVerification.overall_risk_score)}
                </div>
              </div>

              {/* Duplicate Warning */}
              {selectedVerification.duplicate_detected && (
                <Alert className="border-red-200 bg-red-50">
                  <Ban className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 font-medium">
                    ⚠️ DUPLICATE DETECTED - This person may already have an account
                  </AlertDescription>
                </Alert>
              )}

              {/* Documents */}
              <div>
                <h3 className="font-semibold mb-3">Uploaded Documents</h3>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                ) : (
                  <div className="space-y-3">
                    {documents.map(doc => (
                      <Card key={doc.id} className={doc.risk_score > 60 ? 'border-red-200' : ''}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-primary/10 rounded">
                              {doc.document_type === 'selfie_with_id' ? <Camera className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{doc.document_type.replace('_', ' ').toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">
                                Uploaded {format(new Date(doc.uploaded_at), 'MMM dd, yyyy HH:mm')}
                              </p>
                              <div className="flex gap-2 mt-2">
                                <Badge>{doc.status}</Badge>
                                {doc.risk_score > 0 && (
                                  <Badge className={
                                    doc.risk_score <= 30 ? 'bg-green-100 text-green-800' :
                                    doc.risk_score <= 60 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }>
                                    Risk: {doc.risk_score}/100
                                  </Badge>
                                )}
                              </div>
                              {doc.risk_factors && doc.risk_factors.length > 0 && (
                                <Alert className="mt-3 border-yellow-200 bg-yellow-50">
                                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                                  <AlertDescription className="text-sm">
                                    <strong className="text-yellow-900">Issues:</strong>
                                    <ul className="list-disc list-inside mt-1 text-yellow-800">
                                      {doc.risk_factors.map((f: string, i: number) => <li key={i}>{f}</li>)}
                                    </ul>
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Admin Notes */}
              <div>
                <label className="text-sm font-medium">Admin Notes / Rejection Reason</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
            {selectedVerification?.verification_status === 'pending' && (
              <>
                <Button variant="destructive" onClick={handleReject} disabled={approving}>
                  {approving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <ThumbsDown className="h-4 w-4 mr-2" />}
                  Reject
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={approving}>
                  {approving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
