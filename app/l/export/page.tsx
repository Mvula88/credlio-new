'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Download,
  FileSpreadsheet,
  Users,
  CreditCard,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle,
  FileText,
  Clock,
  Filter
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function ExportPage() {
  const [exporting, setExporting] = useState<string | null>(null)
  const [loansFilter, setLoansFilter] = useState({
    status: 'all',
    fromDate: '',
    toDate: ''
  })
  const [repaymentsFilter, setRepaymentsFilter] = useState({
    status: 'all',
    fromDate: '',
    toDate: ''
  })
  const [lateFeesFilter, setLateFeesFilter] = useState({
    status: 'all',
    fromDate: '',
    toDate: ''
  })
  const [exportHistory, setExportHistory] = useState<any[]>([])

  const supabase = createClient()

  const downloadCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      toast.error('No data to export')
      return
    }

    // Get headers from first object
    const headers = Object.keys(data[0])

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header]
          // Handle values that contain commas or quotes
          if (value === null || value === undefined) return ''
          const stringValue = String(value)
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        }).join(',')
      )
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportLoans = async () => {
    try {
      setExporting('loans')

      const { data, error } = await supabase.rpc('export_loans_data', {
        p_status: loansFilter.status === 'all' ? null : loansFilter.status || null,
        p_from_date: loansFilter.fromDate || null,
        p_to_date: loansFilter.toDate || null
      })

      if (error) throw error

      if (data?.data) {
        downloadCSV(data.data, 'loans-export')
        toast.success(`Exported ${data.count} loans`)
      }
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(error.message || 'Failed to export loans')
    } finally {
      setExporting(null)
    }
  }

  const handleExportRepayments = async () => {
    try {
      setExporting('repayments')

      const { data, error } = await supabase.rpc('export_repayments_data', {
        p_loan_id: null,
        p_status: repaymentsFilter.status === 'all' ? null : repaymentsFilter.status || null,
        p_from_date: repaymentsFilter.fromDate || null,
        p_to_date: repaymentsFilter.toDate || null
      })

      if (error) throw error

      if (data?.data) {
        downloadCSV(data.data, 'repayments-export')
        toast.success(`Exported ${data.count} repayments`)
      }
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(error.message || 'Failed to export repayments')
    } finally {
      setExporting(null)
    }
  }

  const handleExportBorrowers = async () => {
    try {
      setExporting('borrowers')

      const { data, error } = await supabase.rpc('export_borrowers_data')

      if (error) throw error

      if (data?.data) {
        downloadCSV(data.data, 'borrowers-export')
        toast.success(`Exported ${data.count} borrowers`)
      }
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(error.message || 'Failed to export borrowers')
    } finally {
      setExporting(null)
    }
  }

  const handleExportLateFees = async () => {
    try {
      setExporting('late_fees')

      const { data, error } = await supabase.rpc('export_late_fees_data', {
        p_status: lateFeesFilter.status === 'all' ? null : lateFeesFilter.status || null,
        p_from_date: lateFeesFilter.fromDate || null,
        p_to_date: lateFeesFilter.toDate || null
      })

      if (error) throw error

      if (data?.data) {
        downloadCSV(data.data, 'late-fees-export')
        toast.success(`Exported ${data.count} late fees`)
      }
    } catch (error: any) {
      console.error('Export error:', error)
      toast.error(error.message || 'Failed to export late fees')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Export Data</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Download your lending data as CSV files for reporting and analysis
        </p>
      </div>

      {/* Export Cards */}
      <Tabs defaultValue="loans" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="loans" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Loans
          </TabsTrigger>
          <TabsTrigger value="repayments" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Repayments
          </TabsTrigger>
          <TabsTrigger value="borrowers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Borrowers
          </TabsTrigger>
          <TabsTrigger value="late_fees" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Late Fees
          </TabsTrigger>
        </TabsList>

        {/* Loans Export */}
        <TabsContent value="loans">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Export Loans
              </CardTitle>
              <CardDescription>
                Export all your loan data including principal, interest, status, and borrower details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Status Filter</Label>
                  <Select
                    value={loansFilter.status}
                    onValueChange={(value) => setLoansFilter({...loansFilter, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="defaulted">Defaulted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={loansFilter.fromDate}
                    onChange={(e) => setLoansFilter({...loansFilter, fromDate: e.target.value})}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={loansFilter.toDate}
                    onChange={(e) => setLoansFilter({...loansFilter, toDate: e.target.value})}
                  />
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <strong>Fields included:</strong> Loan ID, Borrower Name, Phone, Principal, Interest Rate, Term, Monthly Payment, Total Repaid, Status, Currency, Created Date, Disbursed Date, Completed Date, Total Due, Installments Paid/Remaining
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleExportLoans}
                disabled={exporting === 'loans'}
                className="w-full md:w-auto"
              >
                {exporting === 'loans' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Loans to CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Repayments Export */}
        <TabsContent value="repayments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Export Repayments
              </CardTitle>
              <CardDescription>
                Export your repayment schedule data including due dates, amounts, and payment status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Status Filter</Label>
                  <Select
                    value={repaymentsFilter.status}
                    onValueChange={(value) => setRepaymentsFilter({...repaymentsFilter, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={repaymentsFilter.fromDate}
                    onChange={(e) => setRepaymentsFilter({...repaymentsFilter, fromDate: e.target.value})}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={repaymentsFilter.toDate}
                    onChange={(e) => setRepaymentsFilter({...repaymentsFilter, toDate: e.target.value})}
                  />
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <strong>Fields included:</strong> Schedule ID, Loan ID, Borrower Name, Installment #, Due Date, Amount Due, Amount Paid, Late Fee, Status, Paid Date, Is Early Payment, Currency
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleExportRepayments}
                disabled={exporting === 'repayments'}
                className="w-full md:w-auto"
              >
                {exporting === 'repayments' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Repayments to CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Borrowers Export */}
        <TabsContent value="borrowers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Export Borrowers
              </CardTitle>
              <CardDescription>
                Export your borrower directory with their lending history summary
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-blue-50 border-blue-200">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <strong>Fields included:</strong> Borrower ID, Full Name, Phone, Country, Credit Score, Total Loans, Active Loans, Completed Loans, Total Borrowed, Total Repaid, Registered Date
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleExportBorrowers}
                disabled={exporting === 'borrowers'}
                className="w-full md:w-auto"
              >
                {exporting === 'borrowers' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Borrowers to CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Late Fees Export */}
        <TabsContent value="late_fees">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Export Late Fees
              </CardTitle>
              <CardDescription>
                Export late fee records with tier details and waiver information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Status Filter</Label>
                  <Select
                    value={lateFeesFilter.status}
                    onValueChange={(value) => setLateFeesFilter({...lateFeesFilter, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={lateFeesFilter.fromDate}
                    onChange={(e) => setLateFeesFilter({...lateFeesFilter, fromDate: e.target.value})}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={lateFeesFilter.toDate}
                    onChange={(e) => setLateFeesFilter({...lateFeesFilter, toDate: e.target.value})}
                  />
                </div>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <strong>Fields included:</strong> Fee ID, Loan ID, Borrower Name, Installment #, Due Date, Days Overdue, Tier Applied, Fee Percentage, Fee Amount, Status, Waiver Reason, Applied Date, Currency
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleExportLateFees}
                disabled={exporting === 'late_fees'}
                className="w-full md:w-auto"
              >
                {exporting === 'late_fees' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Late Fees to CSV
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export Tips */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Export Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium">Open in Excel/Sheets</p>
                <p className="text-sm text-muted-foreground">CSV files can be opened directly in Microsoft Excel or Google Sheets</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Filter className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium">Use Filters</p>
                <p className="text-sm text-muted-foreground">Apply date and status filters to export specific data ranges</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium">Regular Exports</p>
                <p className="text-sm text-muted-foreground">Consider scheduling regular exports for backup and compliance</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
