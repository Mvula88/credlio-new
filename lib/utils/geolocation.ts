/**
 * Multi-API Geolocation Fallback System
 *
 * Tries 2 different free geolocation APIs in order:
 * 1. ipapi.co (1,000/day) - Primary
 * 2. ip-api.com (45/minute = ~64,800/day) - Fallback
 *
 * This ensures country detection always works even if one API is down.
 */

export interface GeolocationResult {
  success: boolean
  country_code?: string
  country_name?: string
  ip?: string
  error?: string
  api_used?: string
}

/**
 * Primary: ipapi.co
 * Free tier: 1,000 requests/day
 * Response time: ~100ms
 */
async function detectWithIpApiCo(): Promise<GeolocationResult> {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })

    if (!response.ok) {
      throw new Error(`ipapi.co returned ${response.status}`)
    }

    const data = await response.json()

    // Check if we hit rate limit
    if (data.error) {
      throw new Error(`ipapi.co error: ${data.reason || data.error}`)
    }

    return {
      success: true,
      country_code: data.country_code || data.country,
      country_name: data.country_name,
      ip: data.ip,
      api_used: 'ipapi.co'
    }
  } catch (error) {
    console.warn('ipapi.co failed:', error)
    throw error
  }
}

/**
 * Fallback: ip-api.com
 * Free tier: 45 requests/minute (~64,800/day)
 * Response time: ~150ms
 */
async function detectWithIpApi(): Promise<GeolocationResult> {
  try {
    const response = await fetch('http://ip-api.com/json/?fields=status,message,country,countryCode,query', {
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`ip-api.com returned ${response.status}`)
    }

    const data = await response.json()

    if (data.status !== 'success') {
      throw new Error(`ip-api.com error: ${data.message || 'Unknown error'}`)
    }

    return {
      success: true,
      country_code: data.countryCode,
      country_name: data.country,
      ip: data.query,
      api_used: 'ip-api.com'
    }
  } catch (error) {
    console.warn('ip-api.com failed:', error)
    throw error
  }
}

/**
 * Main function: Try both APIs in order until one succeeds
 * Returns the first successful result
 */
export async function detectCountryFromIP(): Promise<GeolocationResult> {
  // Try primary API
  try {
    console.log('Trying primary API: ipapi.co')
    return await detectWithIpApiCo()
  } catch (primaryError) {
    console.warn('Primary API failed, trying fallback: ip-api.com')

    // Try fallback
    try {
      return await detectWithIpApi()
    } catch (fallbackError) {
      // Both APIs failed
      console.error('Both geolocation APIs failed')
      return {
        success: false,
        error: 'Could not detect country from any geolocation service',
        api_used: 'none'
      }
    }
  }
}

/**
 * Check if a country code is in the supported countries list
 */
export function isCountrySupported(
  countryCode: string,
  supportedCountries: { code: string; name: string }[]
): boolean {
  return supportedCountries.some(c => c.code === countryCode)
}

/**
 * Get full country info from code
 */
export function getCountryInfo(
  countryCode: string,
  supportedCountries: { code: string; name: string }[]
): { code: string; name: string } | null {
  return supportedCountries.find(c => c.code === countryCode) || null
}
