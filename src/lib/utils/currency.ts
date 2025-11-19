interface CurrencyConfig {
  code: string
  symbol: string
  minorUnits: number
  locale: string
}

export const CURRENCY_CONFIG: Record<string, CurrencyConfig> = {
  NGN: { code: 'NGN', symbol: '₦', minorUnits: 2, locale: 'en-NG' },
  KES: { code: 'KES', symbol: 'KSh', minorUnits: 2, locale: 'en-KE' },
  ZAR: { code: 'ZAR', symbol: 'R', minorUnits: 2, locale: 'en-ZA' },
  GHS: { code: 'GHS', symbol: '₵', minorUnits: 2, locale: 'en-GH' },
  TZS: { code: 'TZS', symbol: 'TSh', minorUnits: 2, locale: 'en-TZ' },
  UGX: { code: 'UGX', symbol: 'USh', minorUnits: 0, locale: 'en-UG' },
  NAD: { code: 'NAD', symbol: 'N$', minorUnits: 2, locale: 'en-NA' },
  ZMW: { code: 'ZMW', symbol: 'K', minorUnits: 2, locale: 'en-ZM' },
  MWK: { code: 'MWK', symbol: 'MK', minorUnits: 2, locale: 'en-MW' },
  RWF: { code: 'RWF', symbol: 'RF', minorUnits: 0, locale: 'en-RW' },
  XAF: { code: 'XAF', symbol: 'FCFA', minorUnits: 0, locale: 'fr-CM' },
  XOF: { code: 'XOF', symbol: 'CFA', minorUnits: 0, locale: 'fr-CI' },
}

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  NG: 'NGN',
  KE: 'KES',
  ZA: 'ZAR',
  GH: 'GHS',
  TZ: 'TZS',
  UG: 'UGX',
  NA: 'NAD',
  ZM: 'ZMW',
  MW: 'MWK',
  RW: 'RWF',
  CM: 'XAF',
  CI: 'XOF',
}

export function formatCurrency(
  amountMinor: number,
  currencyCode: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const config = CURRENCY_CONFIG[currencyCode]
  if (!config) {
    throw new Error(`Unknown currency code: ${currencyCode}`)
  }

  const amount = amountMinor / Math.pow(10, config.minorUnits)
  
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: config.minorUnits,
    maximumFractionDigits: config.minorUnits,
    ...options
  }).format(amount)
}

export function parseCurrencyInput(
  input: string,
  currencyCode: string
): number {
  const config = CURRENCY_CONFIG[currencyCode]
  if (!config) {
    throw new Error(`Unknown currency code: ${currencyCode}`)
  }

  // Remove currency symbols and spaces
  const cleanInput = input
    .replace(new RegExp(`[${config.symbol}\\s,]`, 'g'), '')
    .trim()

  const amount = parseFloat(cleanInput)
  if (isNaN(amount)) {
    throw new Error('Invalid amount')
  }

  return Math.round(amount * Math.pow(10, config.minorUnits))
}

export function getCountryCurrency(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode] || 'USD'
}

export function calculateAPR(
  principal: number,
  totalInterest: number,
  termMonths: number
): number {
  // Calculate APR in basis points
  const rate = (totalInterest / principal) * (12 / termMonths)
  return Math.round(rate * 10000)
}

export function calculateMonthlyPayment(
  principalMinor: number,
  aprBps: number,
  termMonths: number
): number {
  const principal = principalMinor
  const monthlyRate = aprBps / 10000 / 12
  
  if (monthlyRate === 0) {
    return Math.ceil(principal / termMonths)
  }
  
  return Math.ceil(
    principal * 
    (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
    (Math.pow(1 + monthlyRate, termMonths) - 1)
  )
}