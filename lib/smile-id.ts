/**
 * Smile ID server-side helpers.
 *
 * The web SDK runs client-side and Smile ID POSTs the final result to our
 * callback URL. This module verifies that callback came from Smile (signature
 * check) and translates their result codes into our `smile_id_outcome` enum.
 *
 * Required env vars (set per environment):
 *   SMILE_ID_PARTNER_ID       — your partner id from the Smile ID portal
 *   SMILE_ID_API_KEY          — base64 API key from the portal
 *   SMILE_ID_ENVIRONMENT      — "sandbox" or "production"
 *
 * The actual API call is made from the browser via the Smile ID web SDK; this
 * server module never calls Smile's API directly except for status polling
 * (not implemented here — callbacks are the primary path).
 */

import { createHmac } from 'crypto'

export type SmileIdOutcome =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'no_match'
  | 'spoof'
  | 'duplicate'
  | 'other'

export interface SmileIdConfig {
  partnerId: string
  apiKey: string
  environment: 'sandbox' | 'production'
}

export function getSmileIdConfig(): SmileIdConfig | null {
  const partnerId = process.env.SMILE_ID_PARTNER_ID
  const apiKey = process.env.SMILE_ID_API_KEY
  const env = process.env.SMILE_ID_ENVIRONMENT

  if (!partnerId || !apiKey) return null

  return {
    partnerId,
    apiKey,
    environment: env === 'production' ? 'production' : 'sandbox',
  }
}

/**
 * Verify that a callback came from Smile ID.
 *
 * Smile's signature scheme (v2):
 *   signature = base64( HMAC_SHA256(api_key, timestamp + partner_id + "sid_request") )
 *
 * Both `timestamp` and `signature` are included in the callback body.
 */
export function verifySmileIdSignature(args: {
  timestamp: string
  signature: string
  partnerId: string
  apiKey: string
}): { valid: boolean; error?: string } {
  if (!args.timestamp || !args.signature) {
    return { valid: false, error: 'Missing timestamp or signature' }
  }
  if (args.partnerId !== process.env.SMILE_ID_PARTNER_ID) {
    return { valid: false, error: 'Partner ID mismatch' }
  }

  const payload = `${args.timestamp}${args.partnerId}sid_request`
  const expected = createHmac('sha256', args.apiKey).update(payload).digest('base64')

  // Constant-time compare to avoid timing leaks on the API key.
  if (!safeEquals(expected, args.signature)) {
    return { valid: false, error: 'Signature mismatch' }
  }

  return { valid: true }
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Map a Smile ID ResultCode to our internal outcome enum.
 *
 * Reference: https://docs.usesmileid.com/further-reading/result-codes
 * (Codes evolve — when in doubt route to 'other' so admins still see it.)
 */
export function resultCodeToOutcome(code: string | number | null | undefined): SmileIdOutcome {
  if (code === null || code === undefined) return 'pending'
  const c = String(code)

  // Approved
  if (['0810', '0820', '0821', '1020', '1022'].includes(c)) return 'approved'

  // Liveness failure / spoof attempt
  if (['0901', '0911', '0941'].includes(c)) return 'spoof'

  // Registry lookup found no record
  if (['1013'].includes(c)) return 'no_match'

  // Duplicate registration
  if (['2415'].includes(c)) return 'duplicate'

  // Generic rejection
  if (c.startsWith('09') || c.startsWith('14')) return 'rejected'

  // Smile's internal pending / processing codes
  if (['0001', '0002'].includes(c)) return 'pending'

  return 'other'
}
