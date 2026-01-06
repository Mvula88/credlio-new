'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldAlert, AlertTriangle, Shield, ShieldCheck, Search, Loader2, Check, Eye, Ban, History, User } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const getRiskBadge = (type: string) => {
  const badges: Record<string, { label: string; color: string }> = {
    'LATE_1_7': { label: 'Late 1-7 days', color: 'bg-yellow-100 text-yellow-800' },
    'LATE_8_30': { label: 'Late 8-30 days', color: 'bg-orange-100 text-orange-800' },
    'LATE_31_60': { label: 'Late 31-60 days', color: 'bg-red-100 text-red-800' },
    'DEFAULT': { label: 'Defaulted', color: 'bg-red-600 text-white' },
    'CLEARED': { label: 'Cleared', color: 'bg-green-100 text-green-800' },
  }
  return badges[type] || { label: type, color: 'bg-gray-100 text-gray-800' }
}

export default function RiskManagementPage() {
  const [loading, setLoading] = useState(true)
  const [riskFlags, setRiskFlags] = useState<any[]>([])
  const [resolvedFlags, setResolvedFlags] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [originFilter, setOriginFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<any>(null)
  const [resolutionReason, setResolutionReason] = useState('')
  const [resolving, setResolving] = useState(false)
  const [activeTab, setActiveTab] = useState('active')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadRiskFlags()
    loadResolvedFlags()
  }, [])

  const loadRiskFlags = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('risk_flags')
        .select(`
          *,
          borrowers (
            id,
            full_name,
            phone_e164
          )
        `)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      setRiskFlags(data || [])
    } catch (error) {
      console.error('Error loading risk flags:', error)
      toast.error('Failed to load risk flags')
    } finally {
      setLoading(false)
    }
  }

  const loadResolvedFlags = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_flags')
        .select(`
          *,
          borrowers (
            id,
            full_name,
            phone_e164
          ),
          resolved_by_profile:profiles!risk_flags_resolved_by_fkey (
            full_name,
            user_id
          ),
          created_by_profile:profiles!risk_flags_created_by_fkey (
            full_name,
            user_id
          )
        `)
        .not('resolved_at', 'is', null)
        .order('resolved_at', { ascending: false })
        .limit(100)

      if (error) throw error

      setResolvedFlags(data || [])
    } catch (error) {
      console.error('Error loading resolved flags:', error)
      toast.error('Failed to load resolution history')
    }
  }

  const handleResolve = async () => {
    if (!selectedFlag || !resolutionReason.trim()) {
      toast.error('Please provide a resolution reason')
      return
    }

    try {
      setResolving(true)

      const { error } = await supabase
        .rpc('resolve_risk_flag', {
          p_risk_id: selectedFlag.id,
          p_resolution_reason: resolutionReason,
        })

      if (error) throw error

      toast.success('Risk flag resolved successfully')
      setShowResolveDialog(false)
      setSelectedFlag(null)
      setResolutionReason('')
      loadRiskFlags()
      loadResolvedFlags()
    } catch (error: any) {
      console.error('Error resolving risk flag:', error)
      toast.error(error.message || 'Failed to resolve risk flag')
    } finally {
      setResolving(false)
    }
  }

  const filteredFlags = riskFlags.filter(flag => {
    const search = searchTerm.replace(/\s/g, '')
    const matchesSearch = !searchTerm ||
      flag.borrowers?.id?.toLowerCase().includes(search.toLowerCase())

    const matchesOrigin = originFilter === 'all' ||
      (originFilter === 'lender' && flag.origin === 'LENDER_REPORTED') ||
      (originFilter === 'system' && flag.origin === 'SYSTEM_AUTO')

    const matchesType = typeFilter === 'all' || flag.type === typeFilter

    return matchesSearch && matchesOrigin && matchesType
  })

  const stats = {
    lowRisk: riskFlags.filter(f => f.type === 'LATE_1_7').length,
    mediumRisk: riskFlags.filter(f => f.type === 'LATE_8_30').length,
    highRisk: riskFlags.filter(f => ['LATE_31_60', 'DEFAULT'].includes(f.type)).length,
    activeAlerts: riskFlags.filter(f => f.origin === 'LENDER_REPORTED').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Risk Management</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Monitor and manage platform risks • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Low Risk</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <ShieldCheck className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-green-600">{stats.lowRisk}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Medium Risk</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-xl">
              <Shield className="h-5 w-5 text-yellow-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-yellow-600">{stats.mediumRisk}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">High Risk</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-red-600">{stats.highRisk}</span>
          </CardContent>
        </Card>

        <Card className="tech-card hover-lift border-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active Alerts</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-orange-500/10 to-orange-500/5 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-orange-600">{stats.activeAlerts}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by Borrower ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="system">System Auto</SelectItem>
                <SelectItem value="lender">Lender Reported</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Types</SelectItem>
                <SelectItem value="LATE_1_7">Late 1-7 days</SelectItem>
                <SelectItem value="LATE_8_30">Late 8-30 days</SelectItem>
                <SelectItem value="LATE_31_60">Late 31-60 days</SelectItem>
                <SelectItem value="DEFAULT">Defaulted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Risk Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Risk Flags</TabsTrigger>
          <TabsTrigger value="history">Resolution History</TabsTrigger>
        </TabsList>

        {/* Active Risk Flags Tab */}
        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Risk Flags ({filteredFlags.length})</CardTitle>
              <CardDescription>
                Real-time risk assessment and fraud detection
              </CardDescription>
            </CardHeader>
            <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFlags.length === 0 ? (
            <div className="text-center py-12">
              <ShieldAlert className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {riskFlags.length === 0 ? 'No active risk alerts' : 'No flags match your filters'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {riskFlags.length === 0
                  ? 'Risk monitoring system is active and watching for suspicious activity'
                  : 'Try adjusting your search or filters'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Risk Type</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag) => {
                  const badge = getRiskBadge(flag.type)
                  return (
                    <TableRow key={flag.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{flag.borrowers?.full_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{flag.borrowers?.phone_e164 || 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={badge.color}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={flag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'}>
                          {flag.origin === 'LENDER_REPORTED' ? '👤 Lender' : '🤖 System'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm max-w-xs truncate">
                          {flag.reason || 'Automated flag'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(flag.created_at), 'MMM d, yyyy')}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/admin/borrowers/${flag.borrower_id}`)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedFlag(flag)
                              setShowResolveDialog(true)
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        </div>
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

        {/* Resolution History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resolution History ({resolvedFlags.length})</CardTitle>
              <CardDescription>
                Track who resolved risk flags and when - full audit trail
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : resolvedFlags.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No resolution history yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Resolved risk flags will appear here with full details
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Original Risk</TableHead>
                      <TableHead>Reported By</TableHead>
                      <TableHead>Resolved By</TableHead>
                      <TableHead>Resolution Reason</TableHead>
                      <TableHead>Resolved Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolvedFlags.map((flag) => (
                      <TableRow key={flag.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{flag.borrowers?.full_name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground">{flag.borrowers?.phone_e164 || 'N/A'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRiskBadge(flag.type).color}>
                            {getRiskBadge(flag.type).label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                {flag.created_by_profile?.full_name || 'System'}
                              </p>
                              <Badge variant={flag.origin === 'LENDER_REPORTED' ? 'default' : 'secondary'} className="text-xs">
                                {flag.origin === 'LENDER_REPORTED' ? 'Lender' : 'Auto'}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <p className="text-sm font-medium">
                              {flag.resolved_by_profile?.full_name || 'Admin'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm max-w-xs">
                            {flag.resolution_reason || 'No reason provided'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(flag.resolved_at), 'MMM d, yyyy HH:mm')}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/admin/borrowers/${flag.borrower_id}`)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
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
      </Tabs>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Risk Flag</DialogTitle>
            <DialogDescription>
              Provide a reason for resolving this risk flag
            </DialogDescription>
          </DialogHeader>
          {selectedFlag && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{selectedFlag.borrowers?.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedFlag.borrowers?.phone_e164}</p>
                <Badge className={getRiskBadge(selectedFlag.type).color + ' mt-2'}>
                  {getRiskBadge(selectedFlag.type).label}
                </Badge>
              </div>

              <div>
                <Label>Resolution Reason *</Label>
                <Textarea
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Explain why this risk flag is being resolved..."
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResolveDialog(false)
                setSelectedFlag(null)
                setResolutionReason('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={resolving}>
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resolve Flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
