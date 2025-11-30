'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bell,
  Check,
  CheckCheck,
  CreditCard,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Info,
  ExternalLink,
  MessageSquare,
  FileSignature,
  Flag,
  Trash2,
  Filter,
  Search,
  Users,
  Send,
  Shield
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link?: string
  read: boolean
  priority: string
  action_label?: string
  action_link?: string
  metadata?: any
  created_at: string
  expires_at?: string
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [newNotification, setNewNotification] = useState({
    type: 'platform_announcement',
    title: '',
    message: '',
    priority: 'normal',
    link: '',
    targetGroup: 'all'
  })
  const [sending, setSending] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadNotifications()
  }, [typeFilter, priorityFilter])

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Admin can see all notifications except message notifications
      // Messages should only appear in the Messages page
      let query = supabase
        .from('notifications')
        .select('*')
        .not('type', 'in', '("new_message","message_reply")')
        .order('created_at', { ascending: false })

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter)
      }

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter)
      }

      const { data, error } = await query.limit(200)

      if (error) throw error

      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)

      if (error) throw error

      setNotifications(prev => prev.filter(n => n.id !== id))
      toast.success('Notification deleted')
    } catch (error) {
      console.error('Error deleting notification:', error)
      toast.error('Failed to delete notification')
    }
  }

  const sendBroadcastNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      toast.error('Please fill in title and message')
      return
    }

    try {
      setSending(true)

      // Use the admin_broadcast_notification RPC function
      const { data: count, error } = await supabase.rpc('admin_broadcast_notification', {
        p_title: newNotification.title,
        p_message: newNotification.message,
        p_target: newNotification.targetGroup,
        p_priority: newNotification.priority,
        p_link: newNotification.link || null
      })

      if (error) throw error

      toast.success(`Notification sent to ${count} users`)
      setSendDialogOpen(false)
      setNewNotification({
        type: 'platform_announcement',
        title: '',
        message: '',
        priority: 'normal',
        link: '',
        targetGroup: 'all'
      })
      loadNotifications()
    } catch (error: any) {
      console.error('Error sending notification:', JSON.stringify(error, null, 2))
      const errorMessage = error?.message || error?.details || error?.hint || 'Failed to send notification'
      toast.error(errorMessage)
    } finally {
      setSending(false)
    }
  }

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-red-600 bg-red-50'
      case 'high':
        return 'border-l-4 border-orange-500 bg-orange-50'
      case 'normal':
        return ''
      case 'low':
        return 'opacity-75'
      default:
        return ''
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'loan_offer':
      case 'loan_accepted':
      case 'loan_rejected':
      case 'loan_funded':
      case 'loan_disbursed':
      case 'loan_completed':
      case 'loan_defaulted':
        return <CreditCard className="h-5 w-5 text-blue-600" />
      case 'payment_due':
      case 'payment_received':
      case 'payment_confirmed':
      case 'payment_overdue':
      case 'payment_reminder':
        return <DollarSign className="h-5 w-5 text-green-600" />
      case 'kyc_approved':
      case 'identity_verified':
      case 'kyc_pending_review':
        return <ShieldCheck className="h-5 w-5 text-green-600" />
      case 'kyc_rejected':
      case 'verification_required':
        return <ShieldAlert className="h-5 w-5 text-red-600" />
      case 'risk_flag':
      case 'risk_flag_added':
      case 'fraud_warning':
        return <Flag className="h-5 w-5 text-yellow-600" />
      case 'agreement_generated':
      case 'agreement_signed_lender':
      case 'agreement_signed_borrower':
      case 'agreement_fully_signed':
        return <FileSignature className="h-5 w-5 text-purple-600" />
      case 'new_message':
      case 'message_reply':
        return <MessageSquare className="h-5 w-5 text-blue-600" />
      case 'dispute_filed':
      case 'dispute_response':
      case 'dispute_resolved':
      case 'dispute_escalated':
        return <AlertCircle className="h-5 w-5 text-orange-600" />
      case 'platform_announcement':
      case 'system':
      case 'system_maintenance':
      case 'feature_announcement':
        return <Bell className="h-5 w-5 text-purple-600" />
      default:
        return <Info className="h-5 w-5 text-gray-600" />
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-600 text-white">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-500 text-white">High</Badge>
      case 'normal':
        return <Badge variant="outline">Normal</Badge>
      case 'low':
        return <Badge variant="secondary">Low</Badge>
      default:
        return null
    }
  }

  const notificationTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'platform_announcement', label: 'Platform Announcements' },
    { value: 'system_maintenance', label: 'System Maintenance' },
    { value: 'loan_offer', label: 'Loan Offers' },
    { value: 'loan_accepted', label: 'Loans Accepted' },
    { value: 'payment_received', label: 'Payments Received' },
    { value: 'payment_overdue', label: 'Payment Overdue' },
    { value: 'kyc_approved', label: 'KYC Approved' },
    { value: 'kyc_rejected', label: 'KYC Rejected' },
    { value: 'risk_flag_added', label: 'Risk Flags' },
    { value: 'dispute_filed', label: 'Disputes' },
    { value: 'new_message', label: 'Messages' },
  ]

  const filteredNotifications = notifications.filter(n => {
    if (!searchTerm) return true
    return (
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.user_id.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  const stats = {
    total: notifications.length,
    urgent: notifications.filter(n => n.priority === 'urgent').length,
    high: notifications.filter(n => n.priority === 'high').length,
    unread: notifications.filter(n => !n.read).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notification Center</h1>
          <p className="text-gray-600 mt-1">
            Monitor platform notifications and send announcements
          </p>
        </div>
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Send Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Send Platform Notification</DialogTitle>
              <DialogDescription>
                Create a notification that will be sent to selected user groups.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Notification Type</Label>
                <Select
                  value={newNotification.type}
                  onValueChange={(value) => setNewNotification(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform_announcement">Platform Announcement</SelectItem>
                    <SelectItem value="system_maintenance">System Maintenance</SelectItem>
                    <SelectItem value="feature_announcement">Feature Announcement</SelectItem>
                    <SelectItem value="admin_action">Admin Action</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="targetGroup">Target Users</Label>
                <Select
                  value={newNotification.targetGroup}
                  onValueChange={(value) => setNewNotification(prev => ({ ...prev, targetGroup: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="borrowers">Borrowers Only</SelectItem>
                    <SelectItem value="lenders">Lenders Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={newNotification.priority}
                  onValueChange={(value) => setNewNotification(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Notification title..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={newNotification.message}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Notification message..."
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="link">Link (optional)</Label>
                <Input
                  id="link"
                  value={newNotification.link}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, link: e.target.value }))}
                  placeholder="/path/to/page"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={sendBroadcastNotification} disabled={sending}>
                {sending ? 'Sending...' : 'Send Notification'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unread</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.unread}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Urgent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.urgent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search notifications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {notificationTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>All Platform Notifications</span>
          </CardTitle>
          <CardDescription>
            Monitor all notifications sent across the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No notifications found</p>
              <p className="text-sm text-gray-500 mt-2">
                {typeFilter !== 'all' || priorityFilter !== 'all' || searchTerm
                  ? 'Try adjusting your filters'
                  : 'No notifications have been sent yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notification.read ? 'bg-blue-50' : ''
                  } ${getPriorityStyles(notification.priority)}`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="mt-1 shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-medium text-gray-900">
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-blue-600"></div>
                            )}
                            {getPriorityBadge(notification.priority)}
                            <Badge variant="outline" className="text-xs">
                              {notification.type.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              User: {notification.user_id.substring(0, 8)}...
                            </span>
                            <span>
                              {format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                            <span className="text-gray-400">
                              ({formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {notification.link && (
                            <Link href={notification.link}>
                              <Button variant="outline" size="sm">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Admin notifications are preserved for audit purposes. Use the "Send Announcement" feature to broadcast platform-wide notifications.
        </AlertDescription>
      </Alert>
    </div>
  )
}
