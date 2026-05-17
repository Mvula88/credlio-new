import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Hash a client IP into a stable, non-reversible token. We never store raw
 * IPs — only a hash — so the paper trail stays useful for "same device
 * attested both ends" checks without becoming a privacy liability.
 *
 * Salt with a server secret so hashes can't be correlated across systems.
 */
export function hashClientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd
    ? fwd.split(',')[0]!.trim()
    : (req.headers.get('x-real-ip') ?? null)
  if (!ip) return null

  const salt = process.env.SUPABASE_JWT_SECRET ?? 'credlio-ip-salt'
  return createHash('sha256').update(ip + '|' + salt).digest('hex')
}

export function clientUserAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent') ?? null
}
