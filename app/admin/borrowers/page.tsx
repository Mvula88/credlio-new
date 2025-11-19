'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Search, User, Phone, Mail, TrendingUp, AlertTriangle, CheckCircle, Shield } from 'lucide-react'
import { ExportButton } from '@/components/ExportButton'
import { exportToCSV, formatBorrowerForExport } from '@/lib/export'
import { isPast } from 'date-fns'
import { getCurrencyByCountry, formatCurrency as formatCurrencyUtil } from '@/lib/utils/currency'

export default function AdminBorrowersPage() {
  const [borrowers, setBorrowers] = useState<any[]>([])
  const [filteredBorrowers, setFilteredBorrowers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAllBorrowers()
  }, [])

  useEffect(() => {
    filterBorrowers()
  }, [searchQuery, borrowers])

  const loadAllBorrowers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Get ALL borrowers in the system
      const { data: borrowersData, error } = await supabase
        .from('borrowers')
        .select(`
          id,
          full_name,
          phone_e164,
          email,
          created_at,
          country_code,
          borrower_scores(score),
          loans(
            id,
            status,
            principal_minor,
            currency,
            repayment_schedules(id, status, due_date, paid_at)
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Calculate payment health for each borrower
      const borrowersWithHealth = borrowersData?.map((borrower: any) => {
        let totalOnTime = 0
        let totalLate = 0
        let totalOverdue = 0
        let totalPaid = 0
        let totalDisbursed = 0
        let activeLoans = 0

        borrower.loans?.forEach((loan: any) => {
          totalDisbursed += (loan.principal_minor || 0)
          if (loan.status === 'active') activeLoans++

          loan.repayment_schedules?.forEach((schedule: any) => {
            if (schedule.status === 'paid' && schedule.paid_at) {
              totalPaid++
              const dueDate = new Date(schedule.due_date)
              const paidDate = new Date(schedule.paid_at)
              if (paidDate <= dueDate) {
                totalOnTime++
              } else {
                totalLate++
              }
            } else if (schedule.status !== 'paid' && isPast(new Date(schedule.due_date))) {
              totalOverdue++
            }
          })
        })

        const healthScore = totalPaid > 0 ? Math.round((totalOnTime / totalPaid) * 100) : 0
        const creditScore = borrower.borrower_scores?.[0]?.score || 0

        return {
          ...borrower,
          totalLoans: borrower.loans?.length || 0,
          activeLoans,
          totalDisbursed,
          healthScore,
          creditScore,
          totalOnTime,
          totalLate,
          totalOverdue,
        }
      }) || []

      setBorrowers(borrowersWithHealth)
      setFilteredBorrowers(borrowersWithHealth)
    } catch (error) {
      console.error('Error loading borrowers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterBorrowers = async () => {
    if (!searchQuery.trim()) {
      setFilteredBorrowers(borrowers)
      return
    }

    // ONLY search by National ID (hashed) for security
    try {
      const { hashNationalIdAsync } = await import('@/lib/auth')
      const idHash = await hashNationalIdAsync(searchQuery)

      const filtered = borrowers.filter((borrower) =>
        borrower.national_id_hash === idHash
      )
      setFilteredBorrowers(filtered)
    } catch (error) {
      console.error('Error hashing National ID:', error)
      setFilteredBorrowers([])
    }
  }

  const getHealthBadge = (score: number) => {
    if (score >= 80) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Excellent
        </Badge>
      )
    } else if (score >= 60) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Good
        </Badge>
      )
    } else if (score > 0) {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Poor
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline">
          No History
        </Badge>
      )
    }
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

  const handleExportBorrowers = async () => {
    if (!borrowers || borrowers.length === 0) {
      throw new Error('No borrowers to export')
    }

    const formattedData = borrowers.map(b => formatBorrowerForExport({
      ...b,
      total_loans: b.totalLoans,
      active_loan: b.activeLoans > 0,
    }))

    exportToCSV(formattedData, 'all_borrowers')
  }

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
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Borrowers</h1>
          <p className="text-gray-600 mt-1">Search and view complete borrower profiles and payment history</p>
        </div>
        <ExportButton
          onExport={handleExportBorrowers}
          label="Export All Borrowers"
        />
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Borrowers
          </CardTitle>
          <CardDescription>Search by National ID number only - the most secure unique identifier</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            placeholder="Enter National ID number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Borrowers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{borrowers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Excellent Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {borrowers.filter(b => b.healthScore >= 80).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Good Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {borrowers.filter(b => b.healthScore >= 60 && b.healthScore < 80).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Poor Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {borrowers.filter(b => b.healthScore < 60 && b.healthScore > 0).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {borrowers.reduce((sum, b) => sum + b.activeLoans, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Borrowers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Borrowers</CardTitle>
          <CardDescription>
            {filteredBorrowers.length} borrower{filteredBorrowers.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredBorrowers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No borrowers match your search' : 'No borrowers found'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Credit Score</TableHead>
                    <TableHead>Loans</TableHead>
                    <TableHead>Total Disbursed</TableHead>
                    <TableHead>Payment Health</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBorrowers.map((borrower) => (
                    <TableRow key={borrower.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium">{borrower.full_name}</p>
                            <p className="text-sm text-gray-500">
                              Member since {new Date(borrower.created_at).getFullYear()}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-gray-400" />
                            {borrower.phone_e164}
                          </div>
                          {borrower.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Mail className="h-3 w-3 text-gray-400" />
                              {borrower.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-gray-400" />
                          <span className="font-semibold">
                            {borrower.creditScore || 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{borrower.totalLoans} Total</p>
                          <p className="text-sm text-green-600">{borrower.activeLoans} Active</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          {formatCurrency(borrower.totalDisbursed, borrower.country_code)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {borrower.healthScore > 0 ? (
                          <div className="space-y-1">
                            {getHealthBadge(borrower.healthScore)}
                            <p className="text-sm text-gray-500">{borrower.healthScore}% on-time</p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">No history</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/borrowers/${borrower.id}`)}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          View Profile
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
