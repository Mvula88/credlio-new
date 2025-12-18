'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  User,
  Lock,
  Bell,
  Building2,
  CreditCard,
  Shield,
  ExternalLink,
  Save,
  AlertTriangle,
  CheckCircle,
  UserCheck,
  ShieldCheck
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Profile data
  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    phone: '',
    countryCode: ''
  })

  // Password data
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailPayments: true,
    emailLoans: true,
    emailReports: true,
    emailMarketing: false,
    smsPayments: false,
    smsLoans: false
  })

  // Lender info
  const [lenderInfo, setLenderInfo] = useState({
    businessName: '',
    profileCompleted: false,
    identityComplete: false,
    idVerified: false
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/l/login')
        return
      }

      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (profile) {
        setProfileData({
          fullName: profile.full_name || '',
          email: user.email || '',
          phone: profile.phone_e164 || '',
          countryCode: profile.country_code || ''
        })
      }

      // Load lender info
      const { data: lender } = await supabase
        .from('lenders')
        .select('business_name, profile_completed, id_number, city, physical_address, id_verified')
        .eq('user_id', user.id)
        .single()

      if (lender) {
        // Identity is complete if they have id_number and city
        const identityComplete = !!(lender.id_number && lender.city)
        // Provider info is complete if they have business details
        const providerComplete = !!(lender.business_name && lender.physical_address && lender.profile_completed)

        setLenderInfo({
          businessName: lender.business_name || '',
          profileCompleted: providerComplete,
          identityComplete: identityComplete,
          idVerified: lender.id_verified || false
        })
      }

    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleProfileUpdate = async () => {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please log in to update your profile')
        return
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: profileData.fullName,
          phone_e164: profileData.phone,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (profileError) {
        throw profileError
      }

      // Update email in Supabase Auth if changed
      if (profileData.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: profileData.email
        })

        if (emailError) {
          throw emailError
        }
        toast.success('Profile updated! Please check your new email to confirm the change.')
      } else {
        toast.success('Profile updated successfully')
      }

    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    try {
      setSaving(true)
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (error) {
        throw error
      }

      toast.success('Password updated successfully')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })

    } catch (error: any) {
      console.error('Error updating password:', error)
      toast.error(error.message || 'Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  const handleNotificationsUpdate = async () => {
    try {
      setSaving(true)
      // TODO: Implement notification preferences storage
      // This would typically be stored in a user_preferences table
      toast.success('Notification preferences updated')
    } catch (error) {
      console.error('Error updating notifications:', error)
      toast.error('Failed to update notification preferences')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }

    const confirmText = prompt('Type "DELETE" to confirm account deletion:')
    if (confirmText !== 'DELETE') {
      toast.error('Account deletion cancelled')
      return
    }

    try {
      setSaving(true)
      // TODO: Implement account deletion logic
      // This should be done via a server-side function for security
      toast.error('Account deletion is not yet implemented. Please contact support.')
    } catch (error) {
      console.error('Error deleting account:', error)
      toast.error('Failed to delete account')
    } finally {
      setSaving(false)
    }
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account settings and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="profile" className="space-x-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="space-x-2">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="space-x-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="business" className="space-x-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Business</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="space-x-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="space-x-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Advanced</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                />
                <p className="text-sm text-gray-500">
                  Changing your email will require verification
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={profileData.countryCode}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-sm text-gray-500">
                  Country cannot be changed after registration
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleProfileUpdate} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your password and security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Change Password</h3>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>

                <Button onClick={handlePasswordChange} disabled={saving}>
                  <Lock className="h-4 w-4 mr-2" />
                  {saving ? 'Updating...' : 'Update Password'}
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>
                <p className="text-sm text-gray-600">
                  Add an extra layer of security to your account
                </p>
                <Button variant="outline" disabled>
                  Enable 2FA (Coming Soon)
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Active Sessions</h3>
                <p className="text-sm text-gray-600">
                  Manage devices where you're currently logged in
                </p>
                <Button variant="outline" disabled>
                  View Sessions (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to be notified about activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Email Notifications</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Payment Reminders</Label>
                    <p className="text-sm text-gray-500">
                      Get notified about upcoming and overdue payments
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailPayments}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, emailPayments: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Loan Updates</Label>
                    <p className="text-sm text-gray-500">
                      New loan applications and status changes
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailLoans}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, emailLoans: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Reports & Analytics</Label>
                    <p className="text-sm text-gray-500">
                      Monthly reports and insights
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailReports}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, emailReports: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Marketing Communications</Label>
                    <p className="text-sm text-gray-500">
                      Product updates and promotional content
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailMarketing}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, emailMarketing: checked }))
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">SMS Notifications</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Payment Alerts</Label>
                    <p className="text-sm text-gray-500">
                      Critical payment reminders via SMS
                    </p>
                  </div>
                  <Switch
                    checked={notifications.smsPayments}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, smsPayments: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Loan Alerts</Label>
                    <p className="text-sm text-gray-500">
                      Important loan status updates
                    </p>
                  </div>
                  <Switch
                    checked={notifications.smsLoans}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, smsLoans: checked }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleNotificationsUpdate} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Settings */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>
                Manage your business profile and provider information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Completion Overview */}
              <div className="rounded-lg border bg-gradient-to-r from-gray-50 to-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Profile Completion</h4>
                  <span className="text-sm font-medium">
                    {[lenderInfo.identityComplete, lenderInfo.profileCompleted].filter(Boolean).length}/2 steps
                  </span>
                </div>
                <Progress
                  value={([lenderInfo.identityComplete, lenderInfo.profileCompleted].filter(Boolean).length / 2) * 100}
                  className="h-2"
                />

                {/* Step 1: Identity Verification */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  lenderInfo.identityComplete ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {lenderInfo.identityComplete ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <UserCheck className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${lenderInfo.identityComplete ? 'text-green-900' : 'text-orange-900'}`}>
                        Step 1: Identity Verification
                      </p>
                      <p className={`text-xs ${lenderInfo.identityComplete ? 'text-green-700' : 'text-orange-700'}`}>
                        {lenderInfo.identityComplete ? 'Your identity has been submitted' : 'Submit your ID and personal details'}
                      </p>
                    </div>
                  </div>
                  {!lenderInfo.identityComplete && (
                    <Button size="sm" variant="outline" onClick={() => router.push('/l/complete-profile')}>
                      Complete
                    </Button>
                  )}
                </div>

                {/* Step 2: Business Profile */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  lenderInfo.profileCompleted ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {lenderInfo.profileCompleted ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Building2 className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${lenderInfo.profileCompleted ? 'text-green-900' : 'text-orange-900'}`}>
                        Step 2: Business Profile
                      </p>
                      <p className={`text-xs ${lenderInfo.profileCompleted ? 'text-green-700' : 'text-orange-700'}`}>
                        {lenderInfo.profileCompleted
                          ? lenderInfo.businessName || 'Business profile complete'
                          : 'Add your business details and service areas'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push('/l/provider-info')}
                    disabled={!lenderInfo.identityComplete}
                  >
                    {lenderInfo.profileCompleted ? 'Edit' : 'Complete'}
                  </Button>
                </div>

                {/* ID Verification Status by Admin */}
                {lenderInfo.identityComplete && (
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    lenderInfo.idVerified ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <ShieldCheck className={`h-5 w-5 ${lenderInfo.idVerified ? 'text-green-600' : 'text-blue-600'}`} />
                      <div>
                        <p className={`font-medium text-sm ${lenderInfo.idVerified ? 'text-green-900' : 'text-blue-900'}`}>
                          ID Verification
                        </p>
                        <p className={`text-xs ${lenderInfo.idVerified ? 'text-green-700' : 'text-blue-700'}`}>
                          {lenderInfo.idVerified ? 'Your ID has been verified by admin' : 'Pending admin review'}
                        </p>
                      </div>
                    </div>
                    {lenderInfo.idVerified && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                        Verified
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Identity Details
                  </h4>
                  <p className="text-sm text-gray-500">
                    View or update your personal verification information
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/l/complete-profile')}
                  >
                    View Identity Info
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Provider Profile
                  </h4>
                  <p className="text-sm text-gray-500">
                    Edit your business details and service areas
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/l/provider-info')}
                  >
                    Edit Provider Info
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">License & Documents</h4>
                <p className="text-sm text-gray-500">
                  Upload your lending license and business documents
                </p>
                <Button variant="outline" disabled>
                  <Shield className="h-4 w-4 mr-2" />
                  Manage Documents (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Settings */}
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
              <CardDescription>
                Manage your subscription and payment methods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Current Plan</h4>
                <p className="text-sm text-gray-500">
                  View and manage your subscription
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push('/l/billing')}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  View Billing Details
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              </div>

              <Separator />

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Payment Methods</h4>
                <p className="text-sm text-gray-500">
                  Manage your payment methods for subscription
                </p>
                <Button variant="outline" disabled>
                  Add Payment Method (Coming Soon)
                </Button>
              </div>

              <Separator />

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Billing History</h4>
                <p className="text-sm text-gray-500">
                  View invoices and payment history
                </p>
                <Button variant="outline" disabled>
                  View Invoices (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Manage advanced account options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Data Export</h3>
                <p className="text-sm text-gray-600">
                  Download a copy of your account data
                </p>
                <Button variant="outline" disabled>
                  Export Data (Coming Soon)
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">API Access</h3>
                <p className="text-sm text-gray-600">
                  Generate API keys for programmatic access
                </p>
                <Button variant="outline" disabled>
                  Manage API Keys (Coming Soon)
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>

                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-red-900">Delete Account</h4>
                      <p className="text-sm text-red-700 mt-1">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={saving}
                  >
                    Delete My Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
