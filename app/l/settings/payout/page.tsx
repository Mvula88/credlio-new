'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle,
  CheckCircle2,
  Landmark,
  Building2,
  CreditCard,
  Shield,
  ArrowLeft,
  Save,
  Crown,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface PayoutSettings {
  id: string
  lender_id: string
  bank_name: string
  account_number: string
  account_holder_name: string
  account_type: string
  swift_code: string | null
  branch_code: string | null
  business_registration_number: string | null
  tax_number: string | null
  regulatory_body: string | null
  dpo_merchant_id: string | null
  dpo_merchant_verified: boolean
  is_verified: boolean
  verification_status: string
  created_at: string
  updated_at: string
}

export default function PayoutSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PayoutSettings | null>(null)
  const [lenderTier, setLenderTier] = useState<string>('FREE')
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    bank_name: '',
    account_number: '',
    account_holder_name: '',
    account_type: 'savings',
    swift_code: '',
    branch_code: '',
    business_registration_number: '',
    tax_number: '',
    regulatory_body: '',
    dpo_merchant_id: '',
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please log in to access Payout Settings')
        router.push('/l/login')
        return
      }

      // Check tier
      const { data: tierData } = await supabase.rpc('get_effective_tier', {
        p_user_id: user.id
      })

      if (tierData) {
        setLenderTier(tierData)
      }

      if (tierData !== 'BUSINESS') {
        setLoading(false)
        return
      }

      // Load existing settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('lender_payout_settings')
        .select('*')
        .eq('lender_id', user.id)
        .single()

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Error loading settings:', settingsError)
        toast.error('Failed to load payout settings')
      } else if (settingsData) {
        setSettings(settingsData)
        setFormData({
          bank_name: settingsData.bank_name || '',
          account_number: settingsData.account_number || '',
          account_holder_name: settingsData.account_holder_name || '',
          account_type: settingsData.account_type || 'savings',
          swift_code: settingsData.swift_code || '',
          branch_code: settingsData.branch_code || '',
          business_registration_number: settingsData.business_registration_number || '',
          tax_number: settingsData.tax_number || '',
          regulatory_body: settingsData.regulatory_body || '',
          dpo_merchant_id: settingsData.dpo_merchant_id || '',
        })
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please log in')
        return
      }

      // Validate required fields
      if (!formData.bank_name || !formData.account_number || !formData.account_holder_name) {
        toast.error('Please fill in all required bank account fields')
        setSaving(false)
        return
      }

      // Upsert settings
      const { data, error } = await supabase
        .from('lender_payout_settings')
        .upsert({
          lender_id: user.id,
          bank_name: formData.bank_name,
          account_number: formData.account_number,
          account_holder_name: formData.account_holder_name,
          account_type: formData.account_type,
          swift_code: formData.swift_code || null,
          branch_code: formData.branch_code || null,
          business_registration_number: formData.business_registration_number || null,
          tax_number: formData.tax_number || null,
          regulatory_body: formData.regulatory_body || null,
          dpo_merchant_id: formData.dpo_merchant_id || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving settings:', error)
        toast.error('Failed to save payout settings')
      } else {
        setSettings(data)
        toast.success('Payout settings saved successfully!')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const getVerificationBadge = () => {
    if (!settings) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Not Set Up
        </Badge>
      )
    }

    if (settings.is_verified && settings.dpo_merchant_verified) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Fully Verified
        </Badge>
      )
    }

    if (settings.is_verified) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Pending DPO Verification
        </Badge>
      )
    }

    return (
      <Badge variant="secondary" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Pending Verification
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading Payout Settings...</p>
        </div>
      </div>
    )
  }

  // Not Business tier - show upgrade prompt
  if (lenderTier !== 'BUSINESS') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/l/settings">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <Card className="border-2 border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Payout Settings</CardTitle>
            <CardDescription className="text-base">
              Upgrade to Business Plan to configure automatic payout settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                Required for Collections Feature:
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Bank Account Details</strong> - Where you'll receive payments</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Business Registration</strong> - Regulatory compliance (NAMFISA/NCR/CBN)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>DPO Merchant Account</strong> - Process card payments securely</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Automated Payouts</strong> - Receive funds automatically after deductions</span>
                </li>
              </ul>
            </div>

            <div className="text-center">
              <Link href="/l/billing">
                <Button size="lg" className="gap-2">
                  <Crown className="h-5 w-5" />
                  Upgrade to Business Plan
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Business tier - show payout settings form
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/l/settings">
            <Button variant="ghost" className="gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Payout Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your bank account and business details for receiving payments</p>
        </div>
        {getVerificationBadge()}
      </div>

      {/* Verification Status Alert */}
      {!settings?.is_verified && settings && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900">Verification Pending</h3>
                <p className="text-sm text-orange-800 mt-1">
                  Your payout settings are under review. You'll be notified once verification is complete.
                  This typically takes 1-2 business days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!settings?.dpo_merchant_verified && settings?.is_verified && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900">DPO Merchant Verification Required</h3>
                <p className="text-sm text-orange-800 mt-1">
                  Your bank account is verified, but you need to complete DPO merchant verification to start collecting payments.
                  Please contact support with your DPO merchant ID.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {settings?.is_verified && settings?.dpo_merchant_verified && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">Fully Verified</h3>
                <p className="text-sm text-green-800 mt-1">
                  Your payout settings are fully verified. You can now set up automatic deductions on your loans.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bank Account Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Bank Account Details
          </CardTitle>
          <CardDescription>Where you'll receive payments from borrowers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name *</Label>
              <Input
                id="bank_name"
                placeholder="e.g. First National Bank"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_type">Account Type *</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value) => setFormData({ ...formData, account_type: value })}
              >
                <SelectTrigger id="account_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Savings Account</SelectItem>
                  <SelectItem value="current">Current Account</SelectItem>
                  <SelectItem value="business">Business Account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number *</Label>
              <Input
                id="account_number"
                placeholder="e.g. 1234567890"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_holder_name">Account Holder Name *</Label>
              <Input
                id="account_holder_name"
                placeholder="As it appears on the account"
                value={formData.account_holder_name}
                onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch_code">Branch Code</Label>
              <Input
                id="branch_code"
                placeholder="e.g. 280172"
                value={formData.branch_code}
                onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="swift_code">SWIFT/BIC Code</Label>
              <Input
                id="swift_code"
                placeholder="For international transfers"
                value={formData.swift_code}
                onChange={(e) => setFormData({ ...formData, swift_code: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Registration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Business Registration
          </CardTitle>
          <CardDescription>Regulatory compliance information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="business_registration_number">Registration Number</Label>
              <Input
                id="business_registration_number"
                placeholder="Company/Business registration number"
                value={formData.business_registration_number}
                onChange={(e) => setFormData({ ...formData, business_registration_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="regulatory_body">Regulatory Body</Label>
              <Select
                value={formData.regulatory_body}
                onValueChange={(value) => setFormData({ ...formData, regulatory_body: value })}
              >
                <SelectTrigger id="regulatory_body">
                  <SelectValue placeholder="Select regulatory body" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NAMFISA">NAMFISA (Namibia)</SelectItem>
                  <SelectItem value="NCR">NCR (South Africa)</SelectItem>
                  <SelectItem value="CBN">CBN (Nigeria)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_number">Tax Number / VAT Number</Label>
              <Input
                id="tax_number"
                placeholder="Tax identification number"
                value={formData.tax_number}
                onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DPO Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            DPO Payment Gateway
          </CardTitle>
          <CardDescription>Required for processing card payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dpo_merchant_id">DPO Merchant ID</Label>
            <Input
              id="dpo_merchant_id"
              placeholder="Your DPO merchant account ID"
              value={formData.dpo_merchant_id}
              onChange={(e) => setFormData({ ...formData, dpo_merchant_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Don't have a DPO merchant account? Contact support to get set up.
            </p>
          </div>

          {settings?.dpo_merchant_id && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">DPO Merchant Status</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {settings.dpo_merchant_verified
                      ? 'Your DPO merchant account is verified and active'
                      : 'Verification pending - typically takes 1-2 business days'}
                  </p>
                </div>
                {settings.dpo_merchant_verified ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Link href="/l/settings">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Payout Settings'}
        </Button>
      </div>

      {/* Help Text */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Need Help?</h3>
          <p className="text-sm text-muted-foreground">
            If you have questions about setting up payouts or need assistance with DPO merchant verification,
            please contact our support team at support@credlio.com
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
