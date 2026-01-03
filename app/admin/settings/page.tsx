'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Settings, Bell, Shield, Mail, Database } from 'lucide-react'
import { format } from 'date-fns'

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Admin Settings</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Configure platform settings • {format(new Date(), 'MMMM dd, yyyy')}
        </p>
      </div>

      {/* Platform Settings */}
      <Card className="tech-card border-none">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Platform Configuration</CardTitle>
              <CardDescription>General platform settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Platform Name</Label>
            <Input defaultValue="Credlio" />
          </div>
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input type="email" defaultValue={process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@credlio.com'} readOnly className="bg-muted" />
            <p className="text-xs text-muted-foreground">Configure in .env file: NEXT_PUBLIC_SUPPORT_EMAIL</p>
          </div>
          <div className="space-y-2">
            <Label>Platform Status</Label>
            <div className="flex items-center space-x-2">
              <Switch defaultChecked />
              <span className="text-sm">Platform Active</span>
            </div>
          </div>
          <Button className="bg-gradient-to-r from-primary to-secondary text-white">
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="tech-card border-none">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure admin notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive email alerts for important events</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">KYC Alerts</p>
              <p className="text-sm text-muted-foreground">Notify when new KYC submissions arrive</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Fraud Alerts</p>
              <p className="text-sm text-muted-foreground">Immediate notification for fraud signals</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">System Alerts</p>
              <p className="text-sm text-muted-foreground">Platform errors and warnings</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="tech-card border-none">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Platform security configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Require 2FA for admin access</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Session Timeout</p>
              <p className="text-sm text-muted-foreground">Auto-logout after 30 minutes</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">IP Whitelisting</p>
              <p className="text-sm text-muted-foreground">Restrict admin access by IP</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      {/* Database */}
      <Card className="tech-card border-none">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl">
              <Database className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle>Database Management</CardTitle>
              <CardDescription>Database backup and maintenance</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Automatic Backups</p>
              <p className="text-sm text-muted-foreground">Daily database backups at 2:00 AM</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="space-y-2">
            <Label>Last Backup</Label>
            <p className="text-sm text-muted-foreground">{format(new Date(), 'PPpp')}</p>
          </div>
          <Button variant="outline">
            <Database className="mr-2 h-4 w-4" />
            Create Backup Now
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
