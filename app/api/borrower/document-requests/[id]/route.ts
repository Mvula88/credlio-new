import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashClientIp, clientUserAgent } from '@/lib/ip-hash'

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { borrower_sent_from_email, borrower_sent_to_email, borrower_send_notes } = body

  if (!borrower_sent_from_email || !borrower_sent_to_email) {
    return NextResponse.json(
      { error: 'borrower_sent_from_email and borrower_sent_to_email are required' },
      { status: 400 }
    )
  }

  const { data: existing, error: fetchError } = await supabase
    .from('document_requests')
    .select('id, borrower_user_id, status')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.borrower_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!['requested', 'pending_borrower'].includes(existing.status)) {
    return NextResponse.json(
      { error: `Cannot mark sent from status '${existing.status}'` },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('document_requests')
    .update({
      status: 'sent_by_borrower',
      borrower_sent_at: new Date().toISOString(),
      borrower_sent_from_email,
      borrower_sent_to_email,
      borrower_send_notes: borrower_send_notes ?? null,
      borrower_sent_ip_hash: hashClientIp(request),
      borrower_sent_user_agent: clientUserAgent(request),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
