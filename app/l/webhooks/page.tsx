'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Webhook,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Link,
  Zap
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

const EVENT_TYPES = [
  { value: 'loan.created', label: 'Loan Created', description: 'When a new loan is created' },
  { value: 'loan.approved', label: 'Loan Approved', description: 'When a loan is approved' },
  { value: 'loan.disbursed', label: 'Loan Disbursed', description: 'When funds are disbursed' },
  { value: 'loan.completed', label: 'Loan Completed', description: 'When a loan is fully repaid' },
  { value: 'loan.defaulted', label: 'Loan Defaulted', description: 'When a loan defaults' },
  { value: 'repayment.received', label: 'Repayment Received', description: 'When a payment is received' },
  { value: 'repayment.overdue', label: 'Repayment Overdue', description: 'When a payment is overdue' },
  { value: 'late_fee.applied', label: 'Late Fee Applied', description: 'When a late fee is added' },
  { value: 'restructure.requested', label: 'Restructure Requested', description: 'When restructuring is requested' },
  { value: 'restructure.approved', label: 'Restructure Approved', description: 'When restructuring is approved' },
]

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [deliveryLogs, setDeliveryLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState<string | null>(null)
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
    isActive: true
  })

  const supabase = createClient()

  useEffect(() => {
    loadWebhooks()
  }, [])

  const loadWebhooks = async () => {
    try {
      setLoading(true)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load webhooks
      const { data: webhooksData, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('lender_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setWebhooks(webhooksData || [])

      // Load recent delivery logs
      if (webhooksData && webhooksData.length > 0) {
        const webhookIds = webhooksData.map(w => w.id)
        const { data: logsData } = await supabase
          .from('webhook_delivery_logs')
          .select('*')
          .in('webhook_id', webhookIds)
          .order('created_at', { ascending: false })
          .limit(50)

        setDeliveryLogs(logsData || [])
      }
    } catch (error) {
      console.error('Error loading webhooks:', error)
      toast.error('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (webhook?: any) => {
    if (webhook) {
      setEditingWebhook(webhook)
      setFormData({
        name: webhook.name,
        url: webhook.url,
        events: webhook.events || [],
        isActive: webhook.is_active
      })
    } else {
      setEditingWebhook(null)
      setFormData({
        name: '',
        url: '',
        events: [],
        isActive: true
      })
    }
    setDialogOpen(true)
  }

  const handleEventToggle = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event]
    }))
  }

  const handleSave = async () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      toast.error('Please fill in all required fields and select at least one event')
      return
    }

    // Validate URL
    try {
      new URL(formData.url)
    } catch {
      toast.error('Please enter a valid URL')
      return
    }

    try {
      setSaving(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please sign in')
        return
      }

      if (editingWebhook) {
        // Update existing webhook
        const { error } = await supabase
          .from('webhooks')
          .update({
            name: formData.name,
            url: formData.url,
            events: formData.events,
            is_active: formData.isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingWebhook.id)

        if (error) throw error
        toast.success('Webhook updated successfully')
      } else {
        // Create new webhook with secret
        const secret = 'whsec_' + crypto.randomUUID().replace(/-/g, '')

        const { error } = await supabase
          .from('webhooks')
          .insert({
            lender_id: user.id,
            name: formData.name,
            url: formData.url,
            events: formData.events,
            secret: secret,
            is_active: formData.isActive
          })

        if (error) throw error
        toast.success('Webhook created successfully')
      }

      setDialogOpen(false)
      loadWebhooks()
    } catch (error: any) {
      console.error('Error saving webhook:', error)
      toast.error(error.message || 'Failed to save webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return

    try {
      setDeleting(id)

      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast.success('Webhook deleted')
      loadWebhooks()
    } catch (error: any) {
      console.error('Error deleting webhook:', error)
      toast.error(error.message || 'Failed to delete webhook')
    } finally {
      setDeleting(null)
    }
  }

  const handleToggleActive = async (webhook: any) => {
    try {
      const { error } = await supabase
        .from('webhooks')
        .update({ is_active: !webhook.is_active })
        .eq('id', webhook.id)

      if (error) throw error

      toast.success(webhook.is_active ? 'Webhook disabled' : 'Webhook enabled')
      loadWebhooks()
    } catch (error: any) {
      console.error('Error toggling webhook:', error)
      toast.error('Failed to update webhook')
    }
  }

  const handleTestWebhook = async (webhook: any) => {
    try {
      setTestingWebhook(webhook.id)

      // Call the test webhook function
      const { data, error } = await supabase.rpc('trigger_webhook', {
        p_webhook_id: webhook.id,
        p_event_type: 'test.ping',
        p_payload: {
          message: 'This is a test webhook from Credlio',
          timestamp: new Date().toISOString()
        }
      })

      if (error) throw error

      toast.success('Test webhook sent! Check your endpoint.')
      loadWebhooks() // Refresh to see delivery log
    } catch (error: any) {
      console.error('Error testing webhook:', error)
      toast.error(error.message || 'Failed to send test webhook')
    } finally {
      setTestingWebhook(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
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
      <div className="tech-header p-8 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">Webhooks</h1>
        <p className="text-white/90 text-lg font-medium drop-shadow">
          Receive real-time notifications when events happen in your lending platform
        </p>
      </div>

      {/* Create Webhook Button */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''} configured
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Webhook className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No webhooks configured</h3>
            <p className="text-muted-foreground mb-4">
              Set up webhooks to receive real-time notifications about loan events
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id} className={!webhook.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      webhook.is_active ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Webhook className={`h-5 w-5 ${
                        webhook.is_active ? 'text-green-600' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{webhook.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Link className="h-3 w-3 text-muted-foreground" />
                        <code className="text-xs text-muted-foreground break-all">
                          {webhook.url}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={() => handleToggleActive(webhook)}
                    />
                    <Badge variant={webhook.is_active ? 'default' : 'secondary'}>
                      {webhook.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Events */}
                <div>
                  <p className="text-sm font-medium mb-2">Subscribed Events</p>
                  <div className="flex flex-wrap gap-2">
                    {webhook.events?.map((event: string) => (
                      <Badge key={event} variant="outline" className="text-xs">
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Secret */}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Secret:</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {showSecret === webhook.id ? webhook.secret : '••••••••••••••••'}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSecret(showSecret === webhook.id ? null : webhook.id)}
                  >
                    {showSecret === webhook.id ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(webhook.secret)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>{webhook.success_count || 0} successful</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>{webhook.failure_count || 0} failed</span>
                  </div>
                  {webhook.last_triggered_at && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Last triggered: {format(new Date(webhook.last_triggered_at), 'MMM dd, HH:mm')}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestWebhook(webhook)}
                    disabled={testingWebhook === webhook.id || !webhook.is_active}
                  >
                    {testingWebhook === webhook.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenDialog(webhook)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(webhook.id)}
                    disabled={deleting === webhook.id}
                  >
                    {deleting === webhook.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Delivery Logs */}
      {deliveryLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Recent Deliveries
            </CardTitle>
            <CardDescription>Last 50 webhook delivery attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryLogs.map((log) => {
                    const webhook = webhooks.find(w => w.id === log.webhook_id)
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.event_type}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {webhook?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">
                            {log.response_status || log.error_message?.substring(0, 50)}
                          </code>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook Documentation */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Webhook className="h-5 w-5 text-primary" />
            Webhook Integration Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Payload Format</h4>
            <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
{`{
  "event": "loan.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "loan_id": "uuid",
    "borrower_name": "John Doe",
    "principal": 5000,
    "currency": "USD",
    ...
  }
}`}
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">Verifying Signatures</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Each webhook request includes an <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> header.
              Verify this signature using HMAC-SHA256 with your webhook secret.
            </p>
          </div>

          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-900 text-sm">
              Your endpoint must respond with a 2xx status code within 30 seconds.
              Failed deliveries will be retried up to 3 times with exponential backoff.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? 'Edit Webhook' : 'Create Webhook'}
            </DialogTitle>
            <DialogDescription>
              {editingWebhook
                ? 'Update your webhook configuration'
                : 'Configure a new webhook endpoint to receive event notifications'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., My CRM Integration"
              />
            </div>

            <div>
              <Label>Endpoint URL *</Label>
              <Input
                value={formData.url}
                onChange={(e) => setFormData({...formData, url: e.target.value})}
                placeholder="https://your-server.com/webhooks/credlio"
                type="url"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be a valid HTTPS URL
              </p>
            </div>

            <div>
              <Label className="mb-3 block">Events to Subscribe *</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {EVENT_TYPES.map((event) => (
                  <div
                    key={event.value}
                    className="flex items-start gap-3 p-2 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      id={event.value}
                      checked={formData.events.includes(event.value)}
                      onCheckedChange={() => handleEventToggle(event.value)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={event.value}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {event.label}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {event.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this webhook
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name || !formData.url || formData.events.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {editingWebhook ? 'Update' : 'Create'} Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
