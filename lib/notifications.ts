import { createClient } from '@/lib/supabase/server'

type NotificationType =
  | 'loan_offer'
  | 'loan_accepted'
  | 'payment_due'
  | 'payment_received'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'risk_flag'
  | 'system'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
}

/**
 * Create an in-app notification for a user
 * This is a server-side function that should be called from API routes or server components
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  link
}: CreateNotificationParams): Promise<string | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('create_notification', {
      p_user_id: userId,
      p_type: type,
      p_title: title,
      p_message: message,
      p_link: link || null
    })

    if (error) {
      console.error('Error creating notification:', error)
      return null
    }

    return data as string
  } catch (error) {
    console.error('Failed to create notification:', error)
    return null
  }
}

/**
 * Notification templates for common events
 */
export const NotificationTemplates = {
  loanOfferReceived: (lenderName: string, amount: number, currency: string) => ({
    type: 'loan_offer' as NotificationType,
    title: 'New Loan Offer Received',
    message: `${lenderName} has made you an offer for ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)}`,
    link: '/b/requests'
  }),

  loanAccepted: (borrowerName: string, amount: number, currency: string) => ({
    type: 'loan_accepted' as NotificationType,
    title: 'Loan Offer Accepted',
    message: `${borrowerName} has accepted your loan offer of ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)}`,
    link: '/l/loans'
  }),

  paymentDue: (amount: number, currency: string, dueDate: Date) => ({
    type: 'payment_due' as NotificationType,
    title: 'Payment Due Soon',
    message: `Your loan payment of ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)} is due on ${dueDate.toLocaleDateString()}`,
    link: '/b/repayments'
  }),

  paymentReceived: (borrowerName: string, amount: number, currency: string) => ({
    type: 'payment_received' as NotificationType,
    title: 'Payment Received',
    message: `${borrowerName} has made a payment of ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)}`,
    link: '/l/repayments'
  }),

  kycApproved: () => ({
    type: 'kyc_approved' as NotificationType,
    title: 'KYC Verification Approved',
    message: 'Your identity has been verified. You can now request loans.',
    link: '/b/overview'
  }),

  kycRejected: (reason: string) => ({
    type: 'kyc_rejected' as NotificationType,
    title: 'KYC Verification Rejected',
    message: `Your KYC verification was rejected. Reason: ${reason}`,
    link: '/b/settings'
  }),

  riskFlagAdded: (reason: string) => ({
    type: 'risk_flag' as NotificationType,
    title: 'Account Alert',
    message: `A risk flag has been added to your account: ${reason}. Please contact support for details.`,
    link: '/b/settings'
  }),

  systemAnnouncement: (title: string, message: string) => ({
    type: 'system' as NotificationType,
    title,
    message,
    link: undefined
  })
}

/**
 * Batch create multiple notifications (for admins sending announcements)
 */
export async function createBulkNotifications(
  userIds: string[],
  notification: Omit<CreateNotificationParams, 'userId'>
): Promise<number> {
  let successCount = 0

  for (const userId of userIds) {
    const result = await createNotification({
      userId,
      ...notification
    })

    if (result) {
      successCount++
    }
  }

  return successCount
}
