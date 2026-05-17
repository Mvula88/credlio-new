'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bell, Loader2, Clock } from 'lucide-react'

interface Props {
  loanId: string
}

interface ReminderRow {
  id: string
  sent_at: string
  message: string | null
  channel: string
}

export function PaymentReminderButton({ loanId }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reminders, setReminders] = useState<ReminderRow[]>([])

  const loadReminders = async () => {
    const { data } = await supabase
      .from('payment_reminders')
      .select('id, sent_at, message, channel')
      .eq('loan_id', loanId)
      .order('sent_at', { ascending: false })
      .limit(5)
    setReminders(data ?? [])
  }

  useEffect(() => { void loadReminders() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loanId])

  const send = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/lender/loans/${loanId}/remind`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: message || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send reminder')
      setMessage('')
      setOpen(false)
      await loadReminders()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const lastSent = reminders[0]?.sent_at
  const hoursSinceLast = lastSent ? (Date.now() - new Date(lastSent).getTime()) / 36e5 : Infinity
  const rateLimited = hoursSinceLast < 12

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={rateLimited}>
            <Bell className="h-4 w-4 mr-2" />
            Remind borrower
            {rateLimited && <span className="ml-2 text-xs text-muted-foreground">(wait {Math.ceil(12 - hoursSinceLast)}h)</span>}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send payment reminder</DialogTitle>
            <DialogDescription>
              An in-app notification will go to the borrower right away. The reminder is logged so both of you have an audit trail. Rate limit: one reminder per 12 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-msg">Custom message (optional)</Label>
              <Textarea
                id="reminder-msg"
                rows={3}
                placeholder="Leave blank to use the default reminder including the amount + due date."
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={send} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reminders.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Recent reminders ({reminders.length})
          </p>
          <ul className="space-y-0.5">
            {reminders.map(r => (
              <li key={r.id}>
                {new Date(r.sent_at).toLocaleString()} · {r.channel}
                {r.message && <span className="italic"> — "{r.message.slice(0, 60)}{r.message.length > 60 ? '…' : ''}"</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
