'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search,
  Building2,
  Phone,
  Mail,
  Eye,
  Ban,
  CheckCircle,
  AlertTriangle,
  Globe,
  FileText,
  Filter,
  Image,
  ExternalLink
} from 'lucide-react'

export default function AdminLendersPage() {
  const [lenders, setLenders] = useState<any[]>([])
  const [filteredLenders, setFilteredLenders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; lender: any | null }>({ open: false, lender: null })
  const [actionLoading, setActionLoading] = useState(false)
  const [photoDialog, setPhotoDialog] = useState<{ open: boolean; url: string; lenderName: string }>({ open: false, url: '', lenderName: '' })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      await loadAllLenders()
      await loadCountries()
    }
    loadData()
  }, [])

  useEffect(() => {
    filterLenders()
  }, [searchQuery, countryFilter, lenders])

  const loadCountries = async () => {
    try {
      // Get all countries
      const { data, error } = await supabase
        .from('countries')
        .select('code, name')
        .order('name')

      if (error) {
        console.error('Error loading countries:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })

        // Fallback: extract unique countries from lenders data
        const uniqueCountryCodes = [...new Set(lenders.map(l => l.country_code).filter(Boolean))]
        const fallbackCountries = uniqueCountryCodes.map(code => ({
          code,
          name: code // Use code as name if we can't get country names
        }))
        setCountries(fallbackCountries)
        return
      }

      if (data && data.length > 0) {
        setCountries(data)
      } else {
        console.log('No countries returned from database')
      }
    } catch (error) {
      console.error('Error loading countries:', error)
    }
  }

  const loadAllLenders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      console.log('Current user ID:', user.id)

      // Check if user has admin role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)

      console.log('User roles:', roleData, 'Error:', roleError)

      // Get ALL lenders with their profile info
      const { data: lendersData, error } = await supabase
        .from('lenders')
        .select(`
          user_id,
          profile_completed,
          id_number,
          id_type,
          city,
          lending_purpose,
          contact_number,
          email,
          created_at,
          is_suspended,
          suspension_reason,
          id_photo_path,
          profiles(
            full_name,
            country_code,
            phone_e164,
            onboarding_completed
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error - Full object:', error)
        console.error('Supabase error - Stringified:', JSON.stringify(error))
        console.error('Supabase error - Properties:', Object.keys(error))
        throw error
      }

      console.log('Lenders data loaded:', lendersData?.length, 'records')

      // Map lender data
      const lendersWithStats = lendersData?.map((lender: any) => {
        return {
          ...lender,
          full_name: lender.profiles?.full_name || 'Unknown',
          country_code: lender.profiles?.country_code,
          phone: lender.contact_number || lender.profiles?.phone_e164
        }
      }) || []

      setLenders(lendersWithStats)
      setFilteredLenders(lendersWithStats)
    } catch (error) {
      console.error('Error loading lenders:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterLenders = () => {
    let filtered = lenders

    // Filter by country
    if (countryFilter !== 'all') {
      filtered = filtered.filter((lender) => lender.country_code === countryFilter)
    }

    // Filter by search query (ID number, name, email, phone)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((lender) =>
        lender.id_number?.toLowerCase().includes(query) ||
        lender.full_name?.toLowerCase().includes(query) ||
        lender.email?.toLowerCase().includes(query) ||
        lender.phone?.includes(query) ||
        lender.city?.toLowerCase().includes(query)
      )
    }

    setFilteredLenders(filtered)
  }

  const handleSuspendLender = async (lender: any) => {
    setActionLoading(true)
    try {
      const newSuspendedState = !lender.is_suspended

      const { error } = await supabase
        .from('lenders')
        .update({
          is_suspended: newSuspendedState,
          suspension_reason: newSuspendedState ? 'Suspended by admin' : null
        })
        .eq('user_id', lender.user_id)

      if (error) throw error

      // Update local state
      setLenders(prev => prev.map(l =>
        l.user_id === lender.user_id
          ? { ...l, is_suspended: newSuspendedState, suspension_reason: newSuspendedState ? 'Suspended by admin' : null }
          : l
      ))

      setSuspendDialog({ open: false, lender: null })
    } catch (error) {
      console.error('Error updating lender status:', error)
      alert('Failed to update lender status')
    } finally {
      setActionLoading(false)
    }
  }


  const getStatusBadge = (lender: any) => {
    if (lender.is_suspended) {
      return (
        <Badge variant="destructive">
          <Ban className="h-3 w-3 mr-1" />
          Suspended
        </Badge>
      )
    }
    if (!lender.profile_completed) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Incomplete
        </Badge>
      )
    }
    return (
      <Badge className="bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Lenders</h1>
          <p className="text-gray-600 mt-1">View lender profiles and onboarding information</p>
        </div>
      </div>

      {/* Search and Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filter Lenders
          </CardTitle>
          <CardDescription>Search by ID number, name, email, or phone. Filter by country.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search by ID number, name, email, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        filterLenders()
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={() => filterLenders()}
                  variant="default"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                {searchQuery && (
                  <Button
                    onClick={() => setSearchQuery('')}
                    variant="outline"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="w-full md:w-64">
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger>
                  <Globe className="h-4 w-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Filter by country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.length === 0 ? (
                    <SelectItem value="loading" disabled>Loading countries...</SelectItem>
                  ) : (
                    countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Lenders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredLenders.length}</div>
            {countryFilter !== 'all' && (
              <p className="text-xs text-gray-500">in {countryFilter}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {filteredLenders.filter(l => l.profile_completed && !l.is_suspended).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Incomplete Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {filteredLenders.filter(l => !l.profile_completed).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Suspended</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {filteredLenders.filter(l => l.is_suspended).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lenders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lender Profiles</CardTitle>
          <CardDescription>
            {filteredLenders.length} lender{filteredLenders.length !== 1 ? 's' : ''} found
            {searchQuery && ` matching "${searchQuery}"`}
            {countryFilter !== 'all' && ` in ${countryFilter}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLenders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery || countryFilter !== 'all' ? 'No lenders match your search/filter' : 'No lenders found'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lender</TableHead>
                    <TableHead>ID Verification</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLenders.map((lender) => (
                    <TableRow key={lender.user_id} className={lender.is_suspended ? 'bg-red-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium">{lender.full_name}</p>
                            <p className="text-xs text-gray-500">
                              {lender.lending_purpose?.replace('_', ' ') || 'Personal'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <FileText className="h-3 w-3 text-gray-400" />
                            <span className="font-medium">{lender.id_type?.replace('_', ' ') || 'N/A'}</span>
                          </div>
                          <p className="text-sm font-mono font-medium">
                            {lender.id_number || 'Not provided'}
                          </p>
                          {lender.id_photo_path ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={async () => {
                                // Get signed URL for private bucket
                                const { data, error } = await supabase.storage
                                  .from('lender-id-photos')
                                  .createSignedUrl(lender.id_photo_path.replace('lender-id-photos/', ''), 3600) // 1 hour expiry

                                if (error) {
                                  console.error('Error getting signed URL:', error)
                                  alert('Failed to load ID photo')
                                  return
                                }

                                setPhotoDialog({ open: true, url: data.signedUrl, lenderName: lender.full_name })
                              }}
                            >
                              <Image className="h-3 w-3 mr-1" />
                              View ID Photo
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs">No Photo</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {lender.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3 text-gray-400" />
                              {lender.phone}
                            </div>
                          )}
                          {lender.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Mail className="h-3 w-3 text-gray-400" />
                              {lender.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3 text-gray-400" />
                          <span className="font-medium">{lender.country_code || 'N/A'}</span>
                        </div>
                        {lender.city && (
                          <p className="text-xs text-gray-500 mt-1">{lender.city}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(lender)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/lenders/${lender.user_id}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant={lender.is_suspended ? "default" : "destructive"}
                            size="sm"
                            onClick={() => setSuspendDialog({ open: true, lender })}
                          >
                            {lender.is_suspended ? (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Unsuspend
                              </>
                            ) : (
                              <>
                                <Ban className="h-4 w-4 mr-1" />
                                Suspend
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspend/Unsuspend Dialog */}
      <AlertDialog open={suspendDialog.open} onOpenChange={(open) => setSuspendDialog({ open, lender: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendDialog.lender?.is_suspended ? 'Unsuspend Lender' : 'Suspend Lender'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendDialog.lender?.is_suspended
                ? `Are you sure you want to unsuspend ${suspendDialog.lender?.full_name}? They will be able to access their account again.`
                : `Are you sure you want to suspend ${suspendDialog.lender?.full_name}? They will not be able to access their account or create new loans.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSuspendLender(suspendDialog.lender)}
              disabled={actionLoading}
              className={suspendDialog.lender?.is_suspended ? '' : 'bg-red-600 hover:bg-red-700'}
            >
              {actionLoading ? 'Processing...' : (suspendDialog.lender?.is_suspended ? 'Unsuspend' : 'Suspend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo View Dialog */}
      <AlertDialog open={photoDialog.open} onOpenChange={(open) => setPhotoDialog({ open, url: '', lenderName: '' })}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ID Photo - {photoDialog.lenderName}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex justify-center p-4">
            {photoDialog.url && (
              <img
                src={photoDialog.url}
                alt={`ID Photo of ${photoDialog.lenderName}`}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => window.open(photoDialog.url, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
