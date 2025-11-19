'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Shield,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  Loader2
} from 'lucide-react'

interface VerificationItem {
  id: string
  borrower_id: string
  user_id: string
  borrower_name: string
  borrower_email: string
  borrower_country: string
  borrower_country_name: string
  verification_status: 'pending' | 'approved' | 'rejected'
  selfie_uploaded: boolean
  selfie_hash: string | null
  submitted_at: string
  overall_risk_score: number
  overall_risk_level: string
}

export default function AdminVerificationsPage() {
  const [loading, setLoading] = useState(true)
  const [verifications, setVerifications] = useState<VerificationItem[]>([])
  const [filteredVerifications, setFilteredVerifications] = useState<VerificationItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [countries, setCountries] = useState<any[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string>('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadVerifications()
  }, [])

  useEffect(() => {
    filterVerifications()
  }, [verifications, searchTerm, filter, selectedCountry])

  useEffect(() => {
    loadCountries()
  }, [])

  const loadVerifications = async () => {
    try {
      setLoading(true)

      // First, let's try a simple query to see if we can access the table at all
      console.log('Attempting to load verifications...')
      const { data: testData, error: testError } = await supabase
        .from('borrower_self_verification_status')
        .select('*')
        .limit(5)

      console.log('Simple query result:', { testData, testError })

      // Get all borrower self-verifications with borrower details
      // Note: Must specify the foreign key because there are multiple relationships to borrowers
      const { data, error } = await supabase
        .from('borrower_self_verification_status')
        .select(`
          *,
          borrowers!borrower_self_verification_status_borrower_id_fkey!inner (
            id,
            full_name,
            user_id,
            country_code,
            phone_e164,
            countries!borrowers_country_code_fkey (
              code,
              name
            )
          )
        `)
        .order('started_at', { ascending: false })

      if (error) {
        console.error('Supabase error details:', JSON.stringify(error, null, 2))
        console.error('Error message:', error?.message)
        console.error('Error details:', error?.details)
        console.error('Error hint:', error?.hint)
        throw error
      }

      console.log('Verification data:', data)

      const mapped: VerificationItem[] = (data || []).map((item: any) => ({
        id: item.id,
        borrower_id: item.borrower_id,
        user_id: item.user_id,
        borrower_name: item.borrowers.full_name,
        borrower_email: item.borrowers.phone_e164 || 'N/A', // Using phone as identifier since email is not in borrowers table
        borrower_country: item.borrowers.country_code || 'N/A',
        borrower_country_name: item.borrowers.countries?.name || 'Unknown',
        verification_status: item.verification_status,
        selfie_uploaded: item.selfie_uploaded,
        selfie_hash: item.selfie_hash,
        submitted_at: item.started_at,
        overall_risk_score: item.overall_risk_score || 0,
        overall_risk_level: item.overall_risk_level || 'unknown'
      }))

      setVerifications(mapped)
    } catch (error) {
      console.error('Error loading verifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCountries = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('code, name')
        .order('name')

      if (!error && data) {
        setCountries(data)
      }
    } catch (error) {
      console.error('Error loading countries:', error)
    }
  }

  const filterVerifications = () => {
    let filtered = verifications

    // Filter by status
    if (filter !== 'all') {
      filtered = filtered.filter(v => v.verification_status === filter)
    }

    // Filter by country
    if (selectedCountry !== 'all') {
      filtered = filtered.filter(v => v.borrower_country === selectedCountry)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(v =>
        v.borrower_name.toLowerCase().includes(search) ||
        v.borrower_email.toLowerCase().includes(search)
      )
    }

    setFilteredVerifications(filtered)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRiskBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low':
        return <Badge className="bg-green-100 text-green-800">Low Risk</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium Risk</Badge>
      case 'high':
        return <Badge className="bg-red-100 text-red-800">High Risk</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const stats = {
    total: verifications.length,
    pending: verifications.filter(v => v.verification_status === 'pending').length,
    approved: verifications.filter(v => v.verification_status === 'approved').length,
    rejected: verifications.filter(v => v.verification_status === 'rejected').length
  }

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
          <Shield className="h-8 w-8 text-primary" />
          Borrower Verifications
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and approve borrower identity verification documents
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-600">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">All Countries</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={filter === 'pending' ? 'default' : 'outline'}
                onClick={() => setFilter('pending')}
                size="sm"
              >
                Pending
              </Button>
              <Button
                variant={filter === 'approved' ? 'default' : 'outline'}
                onClick={() => setFilter('approved')}
                size="sm"
              >
                Approved
              </Button>
              <Button
                variant={filter === 'rejected' ? 'default' : 'outline'}
                onClick={() => setFilter('rejected')}
                size="sm"
              >
                Rejected
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Requests</CardTitle>
          <CardDescription>
            {filteredVerifications.length} verification(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredVerifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No verifications found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVerifications.map((verification) => (
                  <TableRow key={verification.id}>
                    <TableCell className="font-medium">{verification.borrower_name}</TableCell>
                    <TableCell>{verification.borrower_email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{verification.borrower_country_name}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(verification.verification_status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {verification.selfie_uploaded ? (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Selfie with ID
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not uploaded</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getRiskBadge(verification.overall_risk_level)}</TableCell>
                    <TableCell>
                      {new Date(verification.submitted_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/admin/verifications/${verification.borrower_id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
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
    </div>
  )
}
