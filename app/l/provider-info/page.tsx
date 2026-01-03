'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

const namibianTowns = [
  'Windhoek',
  'Swakopmund',
  'Walvis Bay',
  'Oshakati',
  'Rundu',
  'Otjiwarongo',
  'Katima Mulilo',
  'Grootfontein',
  'Rehoboth',
  'Gobabis',
  'Keetmanshoop',
  'Tsumeb',
  'Otavi',
  'Okahandja',
  'Ondangwa',
  'Omaruru',
  'Mariental',
  'Lüderitz',
  'Usakos',
  'Ongwediva',
  'Okakarara',
  'Opuwo',
  'Outjo',
  'Outapi',
  'Ohangwena',
  'Oshikango',
  'Okahao',
  'Eenhana',
  'Nkurenkuru',
  'Ruacana',
  'Omuthiya',
  'Oshikuku',
  'Ondobe',
  'Okongo',
  'Omungwelume',
  'Ongandjera',
  'Okalongo',
  'Oniipa',
  'Tsandi',
  'Arandis',
  'Henties Bay',
  'Karibib'
].sort()

export default function ProviderInfoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    businessName: '',
    registrationNumber: '',
    physicalAddress: '',
    postalAddress: '',
    contactNumber: '',
    email: '',
    website: '',
    businessType: '',
    yearsInOperation: '',
    description: '',
    serviceAreas: [] as string[]
  })

  // Load existing provider info
  useEffect(() => {
    const loadProviderInfo = async () => {
      try {
        const response = await fetch('/api/lender/provider-info')
        if (response.ok) {
          const { lender } = await response.json()
          if (lender) {
            setFormData({
              businessName: lender.business_name || '',
              registrationNumber: lender.registration_number || '',
              physicalAddress: lender.physical_address || '',
              postalAddress: lender.postal_address || '',
              contactNumber: lender.contact_number || '',
              email: lender.email || '',
              website: lender.website || '',
              businessType: lender.business_type || '',
              yearsInOperation: lender.years_in_operation?.toString() || '',
              description: lender.description || '',
              serviceAreas: lender.service_areas || []
            })
          }
        }
      } catch (error) {
        console.error('Failed to load provider info:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProviderInfo()
  }, [])

  const handleServiceAreaToggle = (town: string) => {
    setFormData(prev => ({
      ...prev,
      serviceAreas: prev.serviceAreas.includes(town)
        ? prev.serviceAreas.filter(t => t !== town)
        : [...prev.serviceAreas, town]
    }))
  }

  const handleSelectAll = () => {
    setFormData(prev => ({
      ...prev,
      serviceAreas: prev.serviceAreas.length === namibianTowns.length ? [] : [...namibianTowns]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.serviceAreas.length === 0) {
      toast.error('Please select at least one service area')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/lender/provider-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save provider information')
      }

      toast.success('Provider information saved successfully')
      // Force full page reload to refresh the ProfileCompletionBanner in the layout
      window.location.href = '/l/overview'
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save provider information')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Provider Information</CardTitle>
              <CardDescription>Loading...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-32 bg-gray-200 rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-6">
          <Link href="/l/overview">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider Information</CardTitle>
            <CardDescription>
              Complete your business profile to help borrowers understand your lending services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Business Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Business Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registrationNumber">Registration Number</Label>
                    <Input
                      id="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, registrationNumber: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessType">Business Type *</Label>
                    <Select
                      value={formData.businessType}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, businessType: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select business type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="microfinance">Microfinance Institution</SelectItem>
                        <SelectItem value="credit_union">Credit Union</SelectItem>
                        <SelectItem value="private_lender">Private Lender</SelectItem>
                        <SelectItem value="fintech">Fintech Company</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="yearsInOperation">Years in Operation</Label>
                    <Input
                      id="yearsInOperation"
                      type="number"
                      min="0"
                      value={formData.yearsInOperation}
                      onChange={(e) => setFormData(prev => ({ ...prev, yearsInOperation: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="physicalAddress">Physical Address *</Label>
                    <Textarea
                      id="physicalAddress"
                      value={formData.physicalAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, physicalAddress: e.target.value }))}
                      rows={2}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="postalAddress">Postal Address</Label>
                    <Textarea
                      id="postalAddress"
                      value={formData.postalAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, postalAddress: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactNumber">Contact Number *</Label>
                      <Input
                        id="contactNumber"
                        type="tel"
                        value={formData.contactNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, contactNumber: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://example.com"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Business Description */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Business Description</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Tell us about your lending services</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    placeholder="Describe your lending products, interest rates, loan terms, and any special features..."
                  />
                </div>
              </div>

              {/* Service Areas */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Service Areas * (Select all towns you serve)</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {formData.serviceAreas.length === namibianTowns.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {namibianTowns.map((town) => (
                      <div key={town} className="flex items-center space-x-2">
                        <Checkbox
                          id={town}
                          checked={formData.serviceAreas.includes(town)}
                          onCheckedChange={() => handleServiceAreaToggle(town)}
                        />
                        <Label
                          htmlFor={town}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {town}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                {formData.serviceAreas.length > 0 && (
                  <p className="text-sm text-gray-600">
                    {formData.serviceAreas.length} town{formData.serviceAreas.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/l/overview')}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Information'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}