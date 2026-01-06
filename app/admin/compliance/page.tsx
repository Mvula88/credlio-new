'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileCheck,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Users,
  Clock,
  Eye,
  Ban,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Search,
  Loader2,
  Send,
  Building,
  Receipt,
  Timer,
  Scale
} from 'lucide-react'
import { format, differenceInHours } from 'date-fns'
import { toast } from 'sonner'

export default function CompliancePage() {
  const [loading, setLoading] = useState(true)
  const [lenderCompliance, setLenderCompliance] = useState<any[]>([])
  const [pendingProofs, setPendingProofs] = useState<any[]>([])
  const [warnings, setWarnings] = useState<any[]>([])
  const [selectedLender, setSelectedLender] = useState<any>(null)
  const [warningDialog, setWarningDialog] = useState(false)
  const [warningForm, setWarningForm] = useState({
    type: 'late_payment_recording',
    severity: 'warning',
    title: '',
    description: ''
  })
  const [issuingWarning, setIssuingWarning] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadComplianceData()
  }, [])

  const loadComplianceData = async () => {
    try {
      setLoading(true)

      // Load lender compliance records
      const { data: complianceData } = await supabase
        .from('lender_compliance')
        .select(`
          *,
          lenders:lender_id(id, business_name, email)
        `)
        .order('compliance_score', { ascending: true })

      // Load all lenders and combine with compliance data
      const { data: allLenders } = await supabase
        .from('lenders')
        .select('id, user_id, business_name, email')

      // Create combined list with compliance info
      const lendersWithCompliance = allLenders?.map((lender: any) => {
        const compliance = complianceData?.find((c: any) => c.lender_id === lender.user_id)
        return {
          ...lender,
          compliance: compliance || {
            compliance_score: 100,
            status: 'good',
            warning_count: 0,
            payment_proofs_received: 0,
            payment_proofs_approved: 0,
            payment_proofs_rejected: 0
          }
        }
      }) || []

      setLenderCompliance(lendersWithCompliance)

      // Load pending payment proofs (older than 24 hours)
      const { data: proofs } = await supabase
        .from('payment_proofs')
        .select(`
          *,
          loans(id, lender_id, currency, lenders(business_name)),
          borrowers(full_name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      setPendingProofs(proofs || [])

      // Load recent warnings
      const { data: warningsData } = await supabase
        .from('lender_warnings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      setWarnings(warningsData || [])
    } catch (error) {
      console.error('Error loading compliance data:', error)
      toast.error('Failed to load compliance data')
    } finally {
      setLoading(false)
    }
  }

  const handleIssueWarning = async () => {
    if (!selectedLender || !warningForm.title || !warningForm.description) {
      toast.error('Please fill in all fields')
      return
    }

    try {
      setIssuingWarning(true)
      const { error } = await supabase.rpc('admin_issue_warning', {
        p_lender_id: selectedLender.user_id,
        p_warning_type: warningForm.type,
        p_severity: warningForm.severity,
        p_title: warningForm.title,
        p_description: warningForm.description
      })

      if (error) throw error

      toast.success('Warning issued successfully')
      setWarningDialog(false)
      setSelectedLender(null)
      setWarningForm({ type: 'late_payment_recording', severity: 'warning', title: '', description: '' })
      loadComplianceData()
    } catch (error: any) {
      console.error('Error issuing warning:', error)
      toast.error(error.message || 'Failed to issue warning')
    } finally {
      setIssuingWarning(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'bg-green-100 text-green-800'
      case 'warning': return 'bg-yellow-100 text-yellow-800'
      case 'probation': return 'bg-orange-100 text-orange-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      case 'banned': return 'bg-gray-900 text-white'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const filteredLenders = lenderCompliance.filter(l =>
    l.user_id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    totalLenders: lenderCompliance.length,
    goodStanding: lenderCompliance.filter(l => l.compliance?.status === 'good').length,
    warnings: lenderCompliance.filter(l => l.compliance?.status === 'warning').length,
    probation: lenderCompliance.filter(l => l.compliance?.status === 'probation').length,
    suspended: lenderCompliance.filter(l => l.compliance?.status === 'suspended').length,
    banned: lenderCompliance.filter(l => l.compliance?.status === 'banned').length,
    pendingProofs: pendingProofs.length,
    oldProofs: pendingProofs.filter(p => differenceInHours(new Date(), new Date(p.created_at)) > 48).length
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
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Lender Compliance</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Monitor lender behavior • Protect borrowers • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats.totalLenders}</p>
            <p className="text-xs text-gray-600">Total Lenders</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{stats.goodStanding}</p>
            <p className="text-xs text-gray-600">Good Standing</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-yellow-600">{stats.warnings}</p>
            <p className="text-xs text-gray-600">Warnings</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-6 w-6 text-orange-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-orange-600">{stats.probation}</p>
            <p className="text-xs text-gray-600">On Probation</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-600">{stats.suspended}</p>
            <p className="text-xs text-gray-600">Suspended</p>
          </CardContent>
        </Card>
        <Card className="border-gray-800 bg-gray-900">
          <CardContent className="p-4 text-center">
            <Ban className="h-6 w-6 text-white mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{stats.banned}</p>
            <p className="text-xs text-gray-400">Banned</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center">
            <Receipt className="h-6 w-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-600">{stats.pendingProofs}</p>
            <p className="text-xs text-gray-600">Pending Proofs</p>
          </CardContent>
        </Card>
        <Card className={stats.oldProofs > 0 ? 'border-red-200 bg-red-50' : ''}>
          <CardContent className="p-4 text-center">
            <Timer className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-600">{stats.oldProofs}</p>
            <p className="text-xs text-gray-600">Overdue ({'>'}48h)</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lenders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lenders">Lender Compliance</TabsTrigger>
          <TabsTrigger value="pending">
            Pending Proofs
            {stats.oldProofs > 0 && (
              <Badge className="ml-2 bg-red-600">{stats.oldProofs}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="warnings">Warning History</TabsTrigger>
        </TabsList>

        <TabsContent value="lenders">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5" />
                    Lender Compliance Scores
                  </CardTitle>
                  <CardDescription>
                    Monitor lender behavior and take action when needed
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by Lender ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lender</TableHead>
                    <TableHead>Compliance Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Warnings</TableHead>
                    <TableHead>Proofs (A/R/P)</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLenders.map((lender) => (
                    <TableRow key={lender.id} className={
                      lender.compliance?.status === 'suspended' ? 'bg-red-50' :
                      lender.compliance?.status === 'banned' ? 'bg-gray-100' : ''
                    }>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium">{lender.business_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{lender.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-bold ${getScoreColor(lender.compliance?.compliance_score || 100)}`}>
                            {lender.compliance?.compliance_score || 100}
                          </span>
                          <Progress
                            value={lender.compliance?.compliance_score || 100}
                            className="w-20 h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(lender.compliance?.status || 'good')}>
                          {(lender.compliance?.status || 'good').charAt(0).toUpperCase() +
                           (lender.compliance?.status || 'good').slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={lender.compliance?.warning_count > 0 ? 'text-orange-600 font-medium' : ''}>
                          {lender.compliance?.warning_count || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-green-600">{lender.compliance?.payment_proofs_approved || 0}</span>
                          {' / '}
                          <span className="text-red-600">{lender.compliance?.payment_proofs_rejected || 0}</span>
                          {' / '}
                          <span className="text-gray-600">{lender.compliance?.payment_proofs_received || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedLender(lender)
                              setWarningDialog(true)
                            }}
                            disabled={lender.compliance?.status === 'banned'}
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Warn
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Pending Payment Proofs
              </CardTitle>
              <CardDescription>
                Payment proofs awaiting lender review. Proofs older than 48 hours need attention.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingProofs.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">All payment proofs have been reviewed!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Lender</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Wait Time</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingProofs.map((proof) => {
                      const hoursWaiting = differenceInHours(new Date(), new Date(proof.created_at))
                      const isOverdue = hoursWaiting > 48

                      return (
                        <TableRow key={proof.id} className={isOverdue ? 'bg-red-50' : ''}>
                          <TableCell>
                            <p className="font-medium">{proof.borrowers?.full_name || 'Unknown'}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-bold">{proof.amount || proof.amount_claimed}</p>
                          </TableCell>
                          <TableCell>
                            <p>{proof.loans?.lenders?.business_name || 'Unknown'}</p>
                          </TableCell>
                          <TableCell>
                            {format(new Date(proof.created_at), 'MMM d, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge className={isOverdue ? 'bg-red-600' : 'bg-yellow-600'}>
                              <Clock className="h-3 w-3 mr-1" />
                              {hoursWaiting}h
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <a
                              href={proof.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                            >
                              <Eye className="h-4 w-4" />
                              View Proof
                            </a>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warnings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Warning History
              </CardTitle>
              <CardDescription>
                All warnings issued to lenders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {warnings.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">No warnings have been issued yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warnings.map((warning) => (
                      <TableRow key={warning.id}>
                        <TableCell>
                          {format(new Date(warning.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {warning.warning_type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            warning.severity === 'ban' ? 'bg-gray-900' :
                            warning.severity === 'suspension' ? 'bg-red-600' :
                            warning.severity === 'final_warning' ? 'bg-orange-600' :
                            'bg-yellow-600'
                          }>
                            {warning.severity.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{warning.title}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">{warning.description}</p>
                        </TableCell>
                        <TableCell>
                          {warning.acknowledged_at ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
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
      </Tabs>

      {/* Issue Warning Dialog */}
      <Dialog open={warningDialog} onOpenChange={setWarningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Issue Warning to {selectedLender?.business_name}
            </DialogTitle>
            <DialogDescription>
              This will notify the lender and affect their compliance score.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Warning Type</Label>
              <Select
                value={warningForm.type}
                onValueChange={(v) => setWarningForm({ ...warningForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="late_payment_recording">Late Payment Recording</SelectItem>
                  <SelectItem value="unresponsive_to_proofs">Unresponsive to Proofs</SelectItem>
                  <SelectItem value="high_rejection_rate">High Rejection Rate</SelectItem>
                  <SelectItem value="dispute_pattern">Dispute Pattern</SelectItem>
                  <SelectItem value="borrower_complaints">Borrower Complaints</SelectItem>
                  <SelectItem value="policy_violation">Policy Violation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={warningForm.severity}
                onValueChange={(v) => setWarningForm({ ...warningForm, severity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">Notice (Informational)</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="final_warning">Final Warning (Probation)</SelectItem>
                  <SelectItem value="suspension">Suspension (7 days)</SelectItem>
                  <SelectItem value="ban">Permanent Ban</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={warningForm.title}
                onChange={(e) => setWarningForm({ ...warningForm, title: e.target.value })}
                placeholder="Brief summary of the issue"
              />
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={warningForm.description}
                onChange={(e) => setWarningForm({ ...warningForm, description: e.target.value })}
                placeholder="Detailed explanation of the violation and expected corrective action..."
                rows={4}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setWarningDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleIssueWarning}
                disabled={issuingWarning || !warningForm.title || !warningForm.description}
                className={
                  warningForm.severity === 'ban' ? 'bg-gray-900 hover:bg-gray-800' :
                  warningForm.severity === 'suspension' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-orange-600 hover:bg-orange-700'
                }
              >
                {issuingWarning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Issue {warningForm.severity.replace(/_/g, ' ')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
