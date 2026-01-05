'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Ban,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'

export default function RevokeMandatePage() {
  const params = useParams()
  const mandateId = params.mandateId as string

  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  const handleRevoke = async () => {
    if (!confirmed) {
      toast.error('Please confirm that you understand the consequences')
      return
    }

    setLoading(true)

    try {
      // Create a public function to revoke mandate by borrower
      // This would need to be added to the migration
      const { data, error } = await supabase.rpc('revoke_mandate_by_borrower', {
        p_mandate_id: mandateId
      })

      if (error) {
        toast.error(error.message || 'Failed to revoke mandate')
      } else if (data?.success) {
        setSuccess(true)
        toast.success('Automatic deductions have been cancelled')
      } else {
        toast.error(data?.error || 'Failed to revoke mandate')
      }
    } catch (error: any) {
      console.error('Error:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>Automatic Deductions Cancelled</CardTitle>
            <CardDescription>
              Your payment mandate has been successfully revoked
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                No further automatic deductions will be taken from your card.
                You will need to make manual payments to repay your loan.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground text-center">
              Your lender has been notified. You can close this page now.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <Ban className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-3xl font-bold">Cancel Automatic Deductions</h1>
          <p className="text-muted-foreground">
            Are you sure you want to stop automatic payments?
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What Happens When You Cancel?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">No more automatic deductions</p>
                  <p className="text-sm text-muted-foreground">
                    Your card will not be charged automatically for loan repayments
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">You must make manual payments</p>
                  <p className="text-sm text-muted-foreground">
                    You'll be responsible for making payments manually to avoid late fees
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Your lender will be notified</p>
                  <p className="text-sm text-muted-foreground">
                    The lender will receive a notification about this cancellation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Your card is safe</p>
                  <p className="text-sm text-muted-foreground">
                    The stored card information will be deactivated
                  </p>
                </div>
              </div>
            </div>

            <Alert className="bg-orange-50 border-orange-200">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-900">
                <strong>Important:</strong> Your loan balance is still outstanding.
                Cancelling automatic deductions does not cancel your loan.
                You must continue making payments to avoid default.
              </AlertDescription>
            </Alert>

            <div className="flex items-start space-x-2 border rounded-lg p-4">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <div className="space-y-1 leading-none">
                <label
                  htmlFor="confirm"
                  className="text-sm font-medium leading-relaxed cursor-pointer"
                >
                  I understand the consequences
                </label>
                <p className="text-sm text-muted-foreground">
                  I confirm that I want to cancel automatic deductions and will make manual
                  payments to repay my loan.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.close()}
              >
                Keep Active
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleRevoke}
                disabled={!confirmed || loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel Deductions
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>Need help? Contact your lender directly.</p>
        </div>
      </div>
    </div>
  )
}
