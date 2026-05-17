import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashClientIp } from '@/lib/ip-hash'

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, lender_received_via_email, lender_decision_notes } = body as {
    action: 'confirm_received' | 'reject' | 'cancel'
    lender_received_via_email?: string
    lender_decision_notes?: string
  }

  // Fetch the row so we can confirm ownership and read current state.
  const { data: existing, error: fetchError } = await supabase
    .from('document_requests')
    .select('id, lender_id, status')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.lender_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ip_hash = hashClientIp(request)

  let update: Record<string, unknown>
  switch (action) {
    case 'confirm_received':
      if (existing.status !== 'sent_by_borrower') {
        return NextResponse.json(
          { error: `Cannot confirm receipt from status '${existing.status}'` },
          { status: 409 }
        )
      }
      update = {
        status: 'received',
        lender_received_at: new Date().toISOString(),
        lender_received_via_email: lender_received_via_email ?? null,
        lender_decision_notes: lender_decision_notes ?? null,
        lender_decision_ip_hash: ip_hash,
      }
      break
    case 'reject':
      if (!['sent_by_borrower', 'pending_borrower'].includes(existing.status)) {
        return NextResponse.json(
          { error: `Cannot reject from status '${existing.status}'` },
          { status: 409 }
        )
      }
      update = {
        status: 'rejected',
        lender_received_at: new Date().toISOString(),
        lender_decision_notes: lender_decision_notes ?? null,
        lender_decision_ip_hash: ip_hash,
      }
      break
    case 'cancel':
      if (!['requested', 'pending_borrower'].includes(existing.status)) {
        return NextResponse.json(
          { error: `Cannot cancel from status '${existing.status}'` },
          { status: 409 }
        )
      }
      update = { status: 'cancelled', lender_decision_ip_hash: ip_hash }
      break
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await supabase
    .from('document_requests')
    .update(update)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
