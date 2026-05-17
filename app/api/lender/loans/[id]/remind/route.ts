import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashClientIp, clientUserAgent } from '@/lib/ip-hash'

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message: string | null = body?.message ?? null

  const { data, error } = await supabase.rpc('send_payment_reminder', {
    p_loan_id: id,
    p_message: message,
  })

  if (error) {
    // 12-hour rate limit shows up here — surface it cleanly.
    const status = /already sent/.test(error.message) ? 429 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  // Record the lender's IP/UA on the row we just created so the audit trail
  // includes who clicked from where, not just that the RPC fired.
  if (data?.reminder_id) {
    await supabase
      .from('payment_reminders')
      .update({
        lender_ip_hash: hashClientIp(request),
        lender_user_agent: clientUserAgent(request),
      })
      .eq('id', data.reminder_id)
  }

  return NextResponse.json(data ?? { success: true })
}
