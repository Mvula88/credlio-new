# Currency Verification Guide

## How Multi-Currency System Works

Your platform supports **12 African countries**, each with their own local currency:

| Country | Code | Currency | Symbol | Decimals |
|---------|------|----------|--------|----------|
| Nigeria | NG | NGN | ₦ | 2 |
| Kenya | KE | KES | KSh | 2 |
| South Africa | ZA | ZAR | R | 2 |
| Ghana | GH | GHS | ₵ | 2 |
| Tanzania | TZ | TZS | TSh | 2 |
| Uganda | UG | UGX | USh | 0 |
| Namibia | NA | NAD | N$ | 2 |
| Zambia | ZM | ZMW | K | 2 |
| Malawi | MW | MWK | MK | 2 |
| Rwanda | RW | RWF | RF | 0 |
| Cameroon | CM | XAF | FCFA | 0 |
| Ivory Coast | CI | XOF | CFA | 0 |

## How Currency is Determined

1. **During Registration**: User selects their country from dropdown
2. **In Profile**: Country code is stored in `profiles.country_code`
3. **Currency Lookup**: System queries `country_currency_allowed` table to get:
   - Currency code (e.g., "NAD")
   - Currency symbol (e.g., "N$")
   - Minor units (decimals - 0, 2, or 3)
4. **Display**: All amounts use the country's currency throughout the app

## Verification Steps

### Step 1: Check Your Current Profile

As a borrower, your profile contains your country code. To verify:

1. Go to your dashboard (`/b/overview`)
2. Check the browser console (F12) - you should see logs like:
   ```
   Fetching borrower data for country: NA
   Default currency: NAD
   ```

### Step 2: Check Currency Display

Look at these areas in your dashboard:
- **Total Borrowed**: Should show your currency symbol (e.g., "N$0.00" for Namibia)
- **Available Credit**: Should show your currency symbol
- **Loan Request Forms**: Currency input field should show your symbol

### Step 3: Test with Different Countries

To verify each country gets their own currency:

1. **Create test accounts** for different countries:
   - Register as a borrower
   - Select different country during registration
   - Complete onboarding

2. **Expected Results**:
   - Nigerian user sees: **₦0.00**
   - Kenyan user sees: **KSh 0.00**
   - Namibian user sees: **N$0.00**
   - South African user sees: **R0.00**
   - Ugandan user sees: **USh 0** (no decimals)

### Step 4: Database Verification

If you have database access, run these queries:

```sql
-- Check all supported currencies
SELECT country_code, currency_code, currency_symbol, minor_units
FROM country_currency_allowed
ORDER BY country_code;

-- Check a specific borrower's currency
SELECT
  b.id,
  b.full_name,
  b.country_code,
  c.currency_code,
  c.currency_symbol
FROM borrowers b
JOIN country_currency_allowed c ON b.country_code = c.country_code
WHERE b.user_id = 'your-user-id';

-- Check loan requests are using correct currency
SELECT
  lr.id,
  lr.currency,
  lr.amount_minor,
  b.country_code,
  c.currency_symbol
FROM loan_requests lr
JOIN borrowers b ON lr.borrower_id = b.id
JOIN country_currency_allowed c ON b.country_code = c.country_code;
```

## Key Files Using Currency

1. **`lib/utils/currency.ts`** - Currency formatting utilities
2. **`app/b/overview/page.tsx`** - Dashboard showing amounts
3. **`app/b/requests/page.tsx`** - Loan request form
4. **`app/l/marketplace/page.tsx`** - Lender marketplace

## How Currency Flows Through the System

```
User Registration (select country: NA)
         ↓
Profile Created (country_code: "NA")
         ↓
Currency Lookup (query country_currency_allowed WHERE country_code = "NA")
         ↓
Currency Info Retrieved (NAD, "N$", 2 decimals)
         ↓
All Amounts Displayed (formatCurrency uses NAD symbol)
         ↓
Loan Creation (stored with currency: "NAD", amount_minor: in cents)
```

## Testing Checklist

- [ ] Dashboard shows correct currency symbol
- [ ] Loan request form shows correct currency symbol in input
- [ ] Loan amounts display with correct symbol
- [ ] Currency matches user's country
- [ ] Decimals are correct (0 for UGX/RWF/XAF/XOF, 2 for others)
- [ ] Multiple test accounts show different currencies

## What Ensures Currency Isolation?

1. **Database Level**:
   - `country_currency_allowed` table maps countries to currencies
   - All loan records store `currency` and `country_code`

2. **Application Level**:
   - Currency lookup happens on every page load
   - `formatCurrency()` always uses the user's currency info
   - No hardcoded "$" symbols (all use `formatCurrency()`)

3. **Middleware Level**:
   - User's country stored in profile
   - Cannot be changed after registration (locked)

## Common Issues and Fixes

### Issue: Seeing "$" instead of local currency
**Cause**: Hardcoded currency symbol
**Fix**: Replace with `formatCurrency(amount)` function

### Issue: Wrong currency symbol
**Cause**: Currency info not loaded from database
**Fix**: Ensure `country_currency_allowed` query is successful

### Issue: Amount shows wrong decimals
**Cause**: Not using correct `minor_units`
**Fix**: Use `currencyInfo.minorUnits` from database

## Browser Console Verification

Open browser console (F12) and run:

```javascript
// Check currency info being used
console.log(window.localStorage)

// Check network requests to see currency data
// Filter by "country_currency_allowed" in Network tab
```

## Quick Test Script

To quickly verify all countries work correctly, you can test the currency utility:

```javascript
import { getCurrencyByCountry, formatCurrency } from '@/lib/utils/currency'

// Test each country
const countries = ['NG', 'KE', 'ZA', 'GH', 'TZ', 'UG', 'NA', 'ZM', 'MW', 'RW', 'CM', 'CI']

countries.forEach(code => {
  const currency = getCurrencyByCountry(code)
  if (currency) {
    console.log(`${code}: ${formatCurrency(100000, currency)}`)
  }
})

// Expected output:
// NG: ₦1,000.00
// KE: KSh 1,000.00
// ZA: R1,000.00
// NA: N$1,000.00
// UG: USh 1000 (no decimals)
// etc.
```
