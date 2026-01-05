'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Landmark,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Link as LinkIcon,
  Crown,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface SetupDeductionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loanId: string
  loanAmount: number
  outstandingBalance: number
  currency: string
  borrowerName: string
  onSuccess?: () => void
}

export function SetupDeductionDialog({
  open,
  onOpenChange,
  loanId,
  loanAmount,
  outstandingBalance,
  currency,
  borrowerName,
  onSuccess,
}: SetupDeductionDialogProps) {
  const [loading, setLoading] = useState(false)
  const [lenderTier, setLenderTier] = useState<string>('FREE')
  const [hasPayoutSettings, setHasPayoutSettings] = useState(false)
  const [checkingSettings, setCheckingSettings] = useState(true)
  const [formData, setFormData] = useState({
    amount: '',
    frequency: 'monthly',
    deductionDay: '1',
    startDate: '',
  })
  const [consentLink, setConsentLink] = useState<string | null>(null)
  const [mandateCreated, setMandateCreated] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (open) {
      checkTierAndSettings()
      // Set default start date to next month
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      nextMonth.setDate(1)
      setFormData(prev => ({
        ...prev,
        startDate: nextMonth.toISOString().split('T')[0]
      }))
    }
  }, [open])

  const checkTierAndSettings = async () => {
    setCheckingSettings(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check tier
      const { data: tierData } = await supabase.rpc('get_effective_tier', {
        p_user_id: user.id
      })
      if (tierData) {
        setLenderTier(tierData)
      }

      // Check payout settings
      const { data: settingsData } = await supabase
        .from('lender_payout_settings')
        .select('dpo_setup_complete')
        .eq('lender_id', user.id)
        .single()

      setHasPayoutSettings(settingsData?.dpo_setup_complete === true)
    } catch (error) {
      console.error('Error checking settings:', error)
    } finally {
      setCheckingSettings(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.amount || !formData.frequency || !formData.startDate) {
      toast.error('Please fill in all required fields')
      return
    }

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (amount > outstandingBalance) {
      toast.error('Deduction amount cannot exceed outstanding balance')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Please log in to continue')
        return
      }

      // Create payment mandate
      const { data, error } = await supabase.rpc('create_payment_mandate', {
        p_loan_id: loanId,
        p_amount: amount,
        p_frequency: formData.frequency,
        p_deduction_day: parseInt(formData.deductionDay),
        p_start_date: formData.startDate
      })

      if (error) {
        console.error('Error creating mandate:', error)
        toast.error(error.message || 'Failed to create payment mandate')
        return
      }

      if (data.success) {
        setConsentLink(`${window.location.origin}${data.consent_link}`)
        setMandateCreated(true)
        toast.success('Payment mandate created successfully!')
        if (onSuccess) onSuccess()
      } else {
        toast.error(data.message || 'Failed to create payment mandate')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyConsentLink = () => {
    if (consentLink) {
      navigator.clipboard.writeText(consentLink)
      toast.success('Consent link copied to clipboard!')
    }
  }

  const handleClose = () => {
    setFormData({
      amount: '',
      frequency: 'monthly',
      deductionDay: '1',
      startDate: '',
    })
    setConsentLink(null)
    setMandateCreated(false)
    onOpenChange(false)
  }

  if (checkingSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Checking requirements...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Not Business tier
  if (lenderTier !== 'BUSINESS') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-center">Business Plan Required</DialogTitle>
            <DialogDescription className="text-center">
              Automatic payment collections are available on the Business plan
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <Crown className="h-4 w-4" />
              <AlertDescription>
                Upgrade to Business plan to set up automatic card deductions for this loan
              </AlertDescription>
            </Alert>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Link href="/l/billing" className="flex-1">
                <Button className="w-full gap-2">
                  <Crown className="h-4 w-4" />
                  Upgrade
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Missing payout settings
  if (!hasPayoutSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <Settings className="h-8 w-8 text-orange-600" />
            </div>
            <DialogTitle className="text-center">Payout Settings Required</DialogTitle>
            <DialogDescription className="text-center">
              Please complete your payout settings before setting up collections
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You need to add your bank details and complete DPO merchant verification to receive automatic payouts
              </AlertDescription>
            </Alert>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Link href="/l/settings?tab=collections" className="flex-1">
                <Button className="w-full gap-2">
                  <Settings className="h-4 w-4" />
                  Complete Setup
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Success state - mandate created
  if (mandateCreated && consentLink) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <DialogTitle className="text-center">Payment Mandate Created!</DialogTitle>
            <DialogDescription className="text-center">
              Send this consent link to the borrower
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <LinkIcon className="h-4 w-4" />
              <AlertDescription>
                The borrower needs to click this link to authorize automatic deductions
              </AlertDescription>
            </Alert>
            <div className="bg-muted rounded-lg p-4">
              <Label className="text-xs text-muted-foreground">Consent Link</Label>
              <p className="text-sm font-mono mt-1 break-all">{consentLink}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Done
              </Button>
              <Button onClick={copyConsentLink} className="flex-1 gap-2">
                <LinkIcon className="h-4 w-4" />
                Copy Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Main form
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Landmark className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Setup Automatic Deductions</DialogTitle>
          <DialogDescription className="text-center">
            Configure recurring payment deductions for {borrowerName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Loan Info */}
          <Alert>
            <DollarSign className="h-4 w-4" />
            <AlertDescription>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Loan Amount:</span>
                  <span className="font-semibold ml-2">{currency} {loanAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Outstanding:</span>
                  <span className="font-semibold ml-2">{currency} {outstandingBalance.toFixed(2)}</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Amount */}
          <div>
            <Label htmlFor="amount">Deduction Amount *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currency}
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                max={outstandingBalance}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="pl-16"
                placeholder="0.00"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Maximum: {currency} {outstandingBalance.toFixed(2)}
            </p>
          </div>

          {/* Frequency */}
          <div>
            <Label htmlFor="frequency">Payment Frequency *</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value) => setFormData({ ...formData, frequency: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deduction Day */}
          <div>
            <Label htmlFor="deductionDay">
              {formData.frequency === 'monthly' ? 'Day of Month' : 'Day of Week'} *
            </Label>
            {formData.frequency === 'monthly' ? (
              <Input
                id="deductionDay"
                type="number"
                min="1"
                max="31"
                value={formData.deductionDay}
                onChange={(e) => setFormData({ ...formData, deductionDay: e.target.value })}
                placeholder="1-31"
                required
              />
            ) : (
              <Select
                value={formData.deductionDay}
                onValueChange={(value) => setFormData({ ...formData, deductionDay: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monday</SelectItem>
                  <SelectItem value="2">Tuesday</SelectItem>
                  <SelectItem value="3">Wednesday</SelectItem>
                  <SelectItem value="4">Thursday</SelectItem>
                  <SelectItem value="5">Friday</SelectItem>
                  <SelectItem value="6">Saturday</SelectItem>
                  <SelectItem value="7">Sunday</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="startDate">Start Date *</Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              First deduction will occur on this date
            </p>
          </div>

          <Alert className="bg-blue-50 border-blue-200">
            <Calendar className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 text-sm">
              After you create this mandate, you'll receive a consent link to send to the borrower.
              They must authorize the deductions by entering their card details.
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Create Mandate
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
