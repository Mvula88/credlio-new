# Country Verification Solutions

## 🚨 Problem: Users Can Lie About Their Country

**Current Issue:**
- Nigerian user can select "Namibia" during registration
- Get access to Namibian marketplace
- Operate in wrong currency (N$)
- Bypass Nigerian regulations
- No verification that user is actually in selected country

---

## Solutions (Ranked by Effectiveness)

### Solution 1: Phone Number Verification (RECOMMENDED) ⭐⭐⭐⭐⭐

**How it works:**
1. User enters phone number with country code (e.g., +234 for Nigeria)
2. System **extracts country from phone prefix**
3. Send SMS verification code to that number
4. Country is **locked** based on verified phone number

**Pros:**
- ✅ Very accurate (phone numbers are tied to country)
- ✅ Already have phone_e164 field in database
- ✅ SMS verification adds security
- ✅ Hard to fake (would need foreign SIM card)
- ✅ Prevents most fraud

**Cons:**
- ❌ Costs money (SMS API like Twilio, Africa's Talking)
- ❌ Some users may not have phone

**Implementation:**
- Use Africa's Talking for African SMS
- Extract country from phone prefix: +234 → NG, +264 → NA
- Lock country_code after phone verification

**Cost:** ~$0.01-0.05 per SMS

---

### Solution 2: IP Geolocation (AUTO-DETECT) ⭐⭐⭐⭐

**How it works:**
1. Detect user's IP address
2. Use geolocation API to get country
3. Auto-select country (user can't change it)
4. Optional: Allow manual override with verification

**Pros:**
- ✅ Automatic - no user input needed
- ✅ Free tier available (50k requests/month)
- ✅ Good accuracy (85-95%)
- ✅ Easy to implement

**Cons:**
- ❌ VPN users can bypass it
- ❌ Not 100% accurate
- ❌ Privacy concerns

**Implementation:**
```typescript
// Use IP geolocation API
const response = await fetch('https://ipapi.co/json/')
const data = await response.json()
const countryCode = data.country_code // 'NG', 'NA', etc.

// Lock country during registration
```

**Free APIs:**
- ipapi.co (1000 requests/day free)
- ip-api.com (45 requests/minute free)
- geojs.io (unlimited free)

---

### Solution 3: ID Document Verification ⭐⭐⭐⭐⭐

**How it works:**
1. User uploads government ID (already doing this)
2. Extract country from ID document
3. Use OCR to read country/nationality
4. Match against selected country

**Pros:**
- ✅ Most accurate method
- ✅ Already have ID upload in onboarding
- ✅ Catches fraudsters
- ✅ Legally defensible

**Cons:**
- ❌ Expensive ($0.10-$1 per verification)
- ❌ Requires OCR/AI service
- ❌ Slower process (manual review needed)

**Services:**
- Smile Identity (African focus)
- Veriff
- Onfido
- Sumsub

---

### Solution 4: Bank Account Verification ⭐⭐⭐⭐

**How it works:**
1. User provides bank account details
2. Verify bank is in the claimed country
3. Make micro-deposit verification
4. Country locked to bank's country

**Pros:**
- ✅ Very reliable
- ✅ Already collecting bank info for borrowers
- ✅ Hard to fake
- ✅ Required for disbursements anyway

**Cons:**
- ❌ Slow (2-3 days for micro-deposit)
- ❌ Requires payment integration
- ❌ Not all users have bank accounts

**African Payment Processors:**
- Paystack (Nigeria, Ghana, South Africa)
- Flutterwave (Pan-African)
- DPO PayGate

---

### Solution 5: Country Lock (PARTIAL SOLUTION) ⭐⭐⭐

**How it works:**
1. Add warning during registration
2. Lock country after registration (already implemented)
3. Show consequences of wrong country
4. Make it clear country cannot be changed

**Pros:**
- ✅ Free
- ✅ Already partially implemented
- ✅ Immediate
- ✅ Better than nothing

**Cons:**
- ❌ Trust-based (no verification)
- ❌ Dishonest users can still bypass
- ❌ No proof of actual location

**Implementation:**
- Show warning: "⚠️ Select your ACTUAL country. You cannot change this later."
- Add legal text: "False country selection is fraud"
- Disable country field after first save

---

## Recommended Multi-Layer Approach

### **Tier 1: Registration (Free)**
1. ✅ IP Geolocation - Auto-detect and pre-select country
2. ✅ Show warning - "This country was detected from your IP"
3. ✅ Allow override - But show big warning

### **Tier 2: Onboarding (Low Cost)**
4. ✅ Phone Verification - SMS to verify country code matches
5. ✅ Lock country after phone verification

### **Tier 3: Identity Verification (For High-Value Users)**
6. ✅ Admin manual review of ID document
7. ✅ OCR extraction of country from ID (optional)

---

## Quick Implementation: IP + Phone Verification

### Step 1: Add IP Geolocation at Registration

```typescript
// app/l/register/page.tsx (or b/register/page.tsx)

useEffect(() => {
  const detectCountry = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/')
      const data = await response.json()

      // Auto-select detected country
      setValue('country', data.country_code)

      // Show user what was detected
      setDetectedCountry({
        code: data.country_code,
        name: data.country_name,
        ip: data.ip
      })
    } catch (error) {
      console.error('Could not detect country:', error)
    }
  }

  detectCountry()
}, [])
```

### Step 2: Add Phone Verification

```typescript
// When user enters phone number
const verifyPhone = async (phoneNumber: string) => {
  // Extract country code from phone
  const countryFromPhone = extractCountryFromPhone(phoneNumber)
  // +234... → NG, +264... → NA

  // Check if it matches selected country
  if (countryFromPhone !== selectedCountry) {
    alert('Your phone number country does not match selected country!')
    return false
  }

  // Send SMS verification code
  await sendSMS(phoneNumber, code)

  return true
}
```

### Step 3: Lock Country After Verification

Already implemented in migration:
```sql
-- Country cannot be changed after registration
-- From: supabase/migrations/20251119090001_lock_lender_identity_fields.sql
```

---

## What Happens If User Lies?

### Current System (Without Verification):

**If Nigerian user selects Namibia:**
1. ✅ They get access to Namibian marketplace
2. ✅ See N$ currency (confusing for them)
3. ✅ See Namibian borrowers only
4. ❌ Can lend to Namibians (regulatory problem)
5. ❌ Bypass Nigerian lending laws
6. ❌ Currency mismatch (have Naira, lending N$)

**Impact:**
- **Legal Risk**: Operating in wrong jurisdiction
- **Currency Risk**: Confusion with exchange rates
- **Fraud Risk**: Easier to hide identity
- **User Experience**: Everything in wrong currency

---

## Immediate Action Items

### Priority 1: Add Warning (5 minutes) ⚡
Add clear warning at registration:
```
⚠️ IMPORTANT: Select Your ACTUAL Country
- You cannot change this later
- All transactions will be in this country's currency
- False information may result in account suspension
```

### Priority 2: IP Geolocation (30 minutes) ⚡⚡
- Auto-detect country from IP
- Pre-select in dropdown
- Show "Detected from your location: Nigeria"

### Priority 3: Phone Verification (2-4 hours) ⚡⚡⚡
- Integrate Africa's Talking or Twilio
- Verify phone country matches selected country
- Lock country after verification

### Priority 4: Admin Review (Already Done) ✅
- Admins review ID documents during verification
- Can flag mismatched countries
- Reject suspicious registrations

---

## Cost Comparison

| Method | Cost per User | Accuracy | Speed |
|--------|--------------|----------|-------|
| IP Geolocation | Free | 85% | Instant |
| Phone SMS | $0.01-0.05 | 95% | 1 minute |
| ID Document OCR | $0.10-1.00 | 99% | 5 minutes |
| Bank Verification | $0.05-0.20 | 98% | 2-3 days |
| Warning Only | Free | 70% | Instant |

**Recommended:** IP (free) + Phone ($0.03) = **$0.03 per user, 95% accuracy**

---

## Migration Path

### Phase 1: Existing Users (Already Registered)
- ❌ Cannot change their country (already locked)
- ✅ Admin can review during verification
- ✅ Reject if country mismatch detected in ID

### Phase 2: New Users (Going Forward)
- ✅ IP geolocation auto-detects
- ✅ Phone verification confirms
- ✅ Country locked immediately

### Phase 3: Existing Users Reverification (Optional)
- Send email: "Verify your country"
- Require phone verification
- Give 30 days to comply

---

## Example: Africa's Talking Integration

```typescript
// lib/sms/africas-talking.ts
import AfricasTalking from 'africas-talking'

const africastalking = AfricasTalking({
  apiKey: process.env.AT_API_KEY!,
  username: process.env.AT_USERNAME!
})

export async function sendVerificationSMS(phone: string, code: string) {
  const sms = africastalking.SMS

  try {
    const result = await sms.send({
      to: [phone],
      message: `Your Credlio verification code is: ${code}`,
      from: 'Credlio'
    })

    return result
  } catch (error) {
    console.error('SMS failed:', error)
    throw error
  }
}

// Extract country from phone
export function extractCountryFromPhone(phone: string): string {
  const prefixes: Record<string, string> = {
    '+234': 'NG',  // Nigeria
    '+264': 'NA',  // Namibia
    '+254': 'KE',  // Kenya
    '+27': 'ZA',   // South Africa
    '+233': 'GH',  // Ghana
    '+255': 'TZ',  // Tanzania
    '+256': 'UG',  // Uganda
    '+260': 'ZM',  // Zambia
    '+265': 'MW',  // Malawi
    '+250': 'RW',  // Rwanda
    '+237': 'CM',  // Cameroon
    '+225': 'CI',  // Côte d'Ivoire
  }

  for (const [prefix, country] of Object.entries(prefixes)) {
    if (phone.startsWith(prefix)) {
      return country
    }
  }

  return 'UNKNOWN'
}
```

---

## Conclusion

**Current State:** Trust-based system (users can lie)
**Risk Level:** MEDIUM-HIGH
**Recommended Fix:** IP Geolocation + Phone Verification
**Cost:** ~$0.03 per user
**Time to Implement:** 2-4 hours
**Accuracy Improvement:** 70% → 95%

Would you like me to implement IP geolocation and phone verification?
