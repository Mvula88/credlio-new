'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  Trash2
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
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
  created_at: string
}

interface NotificationBellProps {
  userRole: 'lender' | 'borrower' | 'admin'
}

export default function NotificationBell({ userRole }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [messageCount, setMessageCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Initialize component and load data
  useEffect(() => {
    setMounted(true)

    // Load notifications immediately
    loadNotifications()
    loadUnreadCounts()

    // Subscribe to real-time notifications
    const notifChannel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          console.log('Notification change:', payload)
          loadNotifications()
          loadUnreadCounts()
        }
      )
      .subscribe()

    // Subscribe to real-time messages
    const msgChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          loadUnreadCounts()
        }
      )
      .subscribe()

    // Refresh counts every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCounts()
    }, 30000)

    // Listen for messages-read event from messages page
    const handleMessagesRead = () => {
      loadUnreadCounts()
    }
    window.addEventListener('messages-read', handleMessagesRead)

    return () => {
      supabase.removeChannel(notifChannel)
      supabase.removeChannel(msgChannel)
      clearInterval(interval)
      window.removeEventListener('messages-read', handleMessagesRead)
    }
  }, [])

  const loadNotifications = async () => {
    try {
      setLoading(true)

      // Exclude message notifications - those go to the message icon
      // Filter by target_role to show only notifications for the current context (lender/borrower/admin)
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .not('type', 'in', '("new_message","message_reply")')
        .or(`target_role.eq.${userRole},target_role.eq.all,target_role.is.null`)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      setNotifications(data || [])
      const unread = data?.filter(n => !n.read).length || 0
      setUnreadCount(unread)
    } catch (error) {
      console.error('Error loading notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const loadUnreadCounts = async () => {
    try {
      // Get notification count (excluding message notifications, filtered by target_role)
      const { count: notifCount, error: notifError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .not('type', 'in', '("new_message","message_reply")')
        .or(`target_role.eq.${userRole},target_role.eq.all,target_role.is.null`)

      if (!notifError) {
        setUnreadCount(notifCount || 0)
      }

      // Get message count
      const { data: msgCount, error: msgError } = await supabase
        .rpc('get_unread_message_count')

      if (!msgError) {
        setMessageCount(msgCount || 0)
      }
    } catch (error) {
      console.error('Error loading counts:', error)
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
      // Immediately update count
      setUnreadCount(prev => Math.max(0, prev - 1))
      // Also refresh to ensure sync
      loadUnreadCounts()
    } catch (error) {
      console.error('Error marking as read:', error)
      toast.error('Failed to mark notification as read')
    }
  }

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase.rpc('mark_all_notifications_read', {
        p_target_role: userRole
      })

      if (error) throw error

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      // Also refresh to ensure sync
      loadUnreadCounts()
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
      const wasUnread = notifications.find(n => n.id === id)?.read === false
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
      toast.success('Notification deleted')
    } catch (error) {
      console.error('Error deleting notification:', error)
      toast.error('Failed to delete notification')
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }

    if (notification.link) {
      setIsOpen(false)
      router.push(notification.link)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 border-l-4 border-red-600'
      case 'high':
        return 'text-orange-600 border-l-4 border-orange-600'
      case 'normal':
        return 'text-blue-600'
      case 'low':
        return 'text-gray-600'
      default:
        return 'text-blue-600'
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'loan_offer':
      case 'loan_accepted':
      case 'loan_rejected':
      case 'loan_funded':
      case 'loan_disbursed':
        return <CreditCard className="h-4 w-4" />
      case 'payment_due':
      case 'payment_received':
      case 'payment_confirmed':
      case 'payment_overdue':
        return <DollarSign className="h-4 w-4" />
      case 'kyc_approved':
      case 'identity_verified':
        return <ShieldCheck className="h-4 w-4 text-green-600" />
      case 'kyc_rejected':
      case 'verification_required':
        return <ShieldAlert className="h-4 w-4 text-red-600" />
      case 'risk_flag':
      case 'risk_flag_added':
      case 'fraud_warning':
        return <Flag className="h-4 w-4 text-yellow-600" />
      case 'agreement_generated':
      case 'agreement_signed_lender':
      case 'agreement_signed_borrower':
      case 'agreement_fully_signed':
        return <FileSignature className="h-4 w-4 text-purple-600" />
      // Message notifications are now shown via the message icon, not here
      // case 'new_message':
      // case 'message_reply':
      //   return <MessageSquare className="h-4 w-4 text-blue-600" />
      case 'dispute_filed':
      case 'dispute_response':
      case 'dispute_resolved':
        return <AlertCircle className="h-4 w-4 text-orange-600" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const getMessagesLink = () => {
    switch (userRole) {
      case 'lender':
        return '/l/messages'
      case 'borrower':
        return '/b/messages'
      case 'admin':
        return '/admin/messages'
      default:
        return '/messages'
    }
  }

  // Prevent hydration mismatch - show placeholder until mounted
  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Messages Button */}
      <Link href={getMessagesLink()}>
        <Button variant="ghost" size="icon" className="relative">
          <MessageSquare className="h-5 w-5" />
          {messageCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {messageCount > 99 ? '99+' : messageCount}
            </Badge>
          )}
        </Button>
      </Link>

      {/* Notifications Dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                variant="destructive"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-auto p-0 text-xs"
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Bell className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 transition-colors relative ${
                      !notification.read ? 'bg-blue-50' : ''
                    } ${getPriorityColor(notification.priority)}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="mt-1">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-none pr-6">
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-blue-600 shrink-0"></div>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true
                            })}
                          </p>
                          {notification.link && (
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              View
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                          {notification.action_link && notification.action_label && (
                            <Link
                              href={notification.action_link}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              onClick={() => setIsOpen(false)}
                            >
                              {notification.action_label}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotification(notification.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {notifications.length > 0 && (
            <div className="border-t p-2">
              <Link
                href={userRole === 'borrower' ? '/b/notifications' : userRole === 'lender' ? '/l/notifications' : '/admin/notifications'}
                className="block w-full text-center text-sm text-blue-600 hover:text-blue-700 py-2"
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
