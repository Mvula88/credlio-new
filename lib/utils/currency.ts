// Currency utilities for displaying amounts in local country currencies

export interface CurrencyInfo {
  code: string
  symbol: string
  minorUnits: number
  countryCode: string
}

// Convert minor units (e.g., cents) to major units (e.g., dollars)
export function fromMinorUnits(amountMinor: number, minorUnits: number): number {
  return amountMinor / Math.pow(10, minorUnits)
}

// Convert major units to minor units
export function toMinorUnits(amount: number, minorUnits: number): number {
  return Math.round(amount * Math.pow(10, minorUnits))
}

// Format amount with currency symbol
export function formatCurrency(
  amountMinor: number,
  currency: CurrencyInfo
): string {
  const majorAmount = fromMinorUnits(amountMinor, currency.minorUnits)

  // Format with appropriate decimal places
  const formatted = majorAmount.toLocaleString('en-US', {
    minimumFractionDigits: currency.minorUnits,
    maximumFractionDigits: currency.minorUnits,
  })

  return `${currency.symbol}${formatted}`
}

// Format amount with currency code (e.g., "NGN 5,000.00")
export function formatCurrencyWithCode(
  amountMinor: number,
  currency: CurrencyInfo
): string {
  const majorAmount = fromMinorUnits(amountMinor, currency.minorUnits)

  const formatted = majorAmount.toLocaleString('en-US', {
    minimumFractionDigits: currency.minorUnits,
    maximumFractionDigits: currency.minorUnits,
  })

  return `${currency.code} ${formatted}`
}

// Parse user input to minor units
export function parseAmountToMinorUnits(
  input: string,
  minorUnits: number
): number {
  // Remove currency symbols and spaces
  const cleaned = input.replace(/[^\d.]/g, '')
  const amount = parseFloat(cleaned)

  if (isNaN(amount)) {
    return 0
  }

  return toMinorUnits(amount, minorUnits)
}

// Common African currencies (matches your country_currency_allowed table)
export const AFRICAN_CURRENCIES: Record<string, CurrencyInfo> = {
  NGN: {
    code: 'NGN',
    symbol: '₦',
    minorUnits: 2,
    countryCode: 'NG',
  },
  KES: {
    code: 'KES',
    symbol: 'KSh',
    minorUnits: 2,
    countryCode: 'KE',
  },
  ZAR: {
    code: 'ZAR',
    symbol: 'R',
    minorUnits: 2,
    countryCode: 'ZA',
  },
  GHS: {
    code: 'GHS',
    symbol: '₵',
    minorUnits: 2,
    countryCode: 'GH',
  },
  TZS: {
    code: 'TZS',
    symbol: 'TSh',
    minorUnits: 2,
    countryCode: 'TZ',
  },
  NAD: {
    code: 'NAD',
    symbol: 'N$',
    minorUnits: 2,
    countryCode: 'NA',
  },
  UGX: {
    code: 'UGX',
    symbol: 'USh',
    minorUnits: 0,
    countryCode: 'UG',
  },
  RWF: {
    code: 'RWF',
    symbol: 'RF',
    minorUnits: 0,
    countryCode: 'RW',
  },
  MWK: {
    code: 'MWK',
    symbol: 'MK',
    minorUnits: 2,
    countryCode: 'MW',
  },
  ZMW: {
    code: 'ZMW',
    symbol: 'K',
    minorUnits: 2,
    countryCode: 'ZM',
  },
  XOF: {
    code: 'XOF',
    symbol: 'CFA',
    minorUnits: 0,
    countryCode: 'CI',
  },
  XAF: {
    code: 'XAF',
    symbol: 'FCFA',
    minorUnits: 0,
    countryCode: 'CM',
  },
}

// Get currency info by currency code
export function getCurrencyInfo(currencyCode: string): CurrencyInfo | undefined {
  return AFRICAN_CURRENCIES[currencyCode]
}

// Get currency info by country code
export function getCurrencyByCountry(countryCode: string): CurrencyInfo | undefined {
  return Object.values(AFRICAN_CURRENCIES).find(
    (currency) => currency.countryCode === countryCode
  )
}
