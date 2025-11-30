'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Filter
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Notification {
  id: string
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

export default function BorrowerNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<string>('all')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    loadNotifications()
  }, [typeFilter, readFilter])

  // Auto-mark all notifications as read when page loads
  useEffect(() => {
    const autoMarkAsRead = async () => {
      try {
        await supabase.rpc('mark_all_notifications_read')
      } catch (error) {
        console.error('Error auto-marking notifications as read:', error)
      }
    }

    autoMarkAsRead()
  }, [])

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/b/login')
        return
      }

      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .or('target_role.eq.borrower,target_role.eq.all')
        .not('type', 'in', '("new_message","message_reply")')
        .order('created_at', { ascending: false })

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter)
      }

      if (readFilter === 'unread') {
        query = query.eq('read', false)
      } else if (readFilter === 'read') {
        query = query.eq('read', true)
      }

      const { data, error } = await query.limit(100)

      if (error) throw error

      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase.rpc('mark_notification_read', {
        p_notification_id: notificationId
      })

      if (error) throw error

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
      )
      toast.success('Notification marked as read')
    } catch (error) {
      console.error('Error marking as read:', error)
      toast.error('Failed to mark notification as read')
    }
  }

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase.rpc('mark_all_notifications_read')

      if (error) throw error

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Error marking all as read:', error)
      toast.error('Failed to mark all as read')
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
        return <CreditCard className="h-5 w-5 text-blue-600" />
      case 'payment_due':
      case 'payment_received':
      case 'payment_confirmed':
      case 'payment_overdue':
      case 'payment_reminder':
        return <DollarSign className="h-5 w-5 text-green-600" />
      case 'kyc_approved':
      case 'identity_verified':
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
      default:
        return null
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const notificationTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'loan_offer', label: 'Loan Offers' },
    { value: 'loan_funded', label: 'Loan Funded' },
    { value: 'payment_due', label: 'Payment Due' },
    { value: 'payment_reminder', label: 'Payment Reminder' },
    { value: 'kyc_approved', label: 'KYC Approved' },
    { value: 'agreement_generated', label: 'Agreements' },
    { value: 'new_message', label: 'Messages' },
    { value: 'dispute_filed', label: 'Disputes' },
  ]

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
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-1">
            Stay updated on your loan applications and payments
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unread</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Urgent/High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {notifications.filter(n => n.priority === 'urgent' || n.priority === 'high').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
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

        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Read status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>All Notifications</span>
          </CardTitle>
          <CardDescription>
            Click on a notification to view details or take action
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No notifications found</p>
              <p className="text-sm text-gray-500 mt-2">
                {typeFilter !== 'all' || readFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : "You're all caught up!"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
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
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-gray-900">
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-blue-600"></div>
                            )}
                            {getPriorityBadge(notification.priority)}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
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
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            </Link>
                          )}
                          {notification.action_link && notification.action_label && (
                            <Link href={notification.action_link}>
                              <Button size="sm">
                                {notification.action_label}
                              </Button>
                            </Link>
                          )}
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
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
          Notifications are automatically cleared after 30 days. Important notifications about active loans are preserved until the loan is completed.
        </AlertDescription>
      </Alert>
    </div>
  )
}
