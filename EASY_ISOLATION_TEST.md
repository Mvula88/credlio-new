# Easy Country Isolation Test Guide

## Quick Manual Test (5 Minutes)

### Step 1: Create Two Borrower Accounts in Different Countries

#### Account 1: Nigerian Borrower
1. Open browser (or incognito window)
2. Go to: `http://localhost:3000/b/register`
3. Register with:
   - Email: `nigerian.borrower@test.com`
   - Password: `Test1234!`
   - **Country: Nigeria (NG)**
   - Phone: `+2348012345678`
4. Complete onboarding (upload any test photo for ID)
5. **Create a loan request** for **₦50,000**
6. Note: You should see currency as **₦** (Naira symbol)
7. **Logout**

#### Account 2: Namibian Borrower
1. Open new incognito/private window
2. Go to: `http://localhost:3000/b/register`
3. Register with:
   - Email: `namibian.borrower@test.com`
   - Password: `Test1234!`
   - **Country: Namibia (NA)**
   - Phone: `+26481234567`
4. Complete onboarding (upload any test photo for ID)
5. **Create a loan request** for **N$5,000**
6. Note: You should see currency as **N$** (Namibian Dollar symbol)
7. **Logout**

---

### Step 2: Create Two Lender Accounts

#### Account 3: Nigerian Lender
1. Open browser
2. Go to: `http://localhost:3000/l/register`
3. Register with:
   - Email: `nigerian.lender@test.com`
   - Password: `Test1234!`
   - **Country: Nigeria (NG)**
4. Complete profile
5. Go to **Marketplace**: `http://localhost:3000/l/marketplace`
6. **EXPECTED RESULT**:
   - ✅ You **SHOULD SEE** the Nigerian borrower's ₦50,000 request
   - ✅ Amount shown as **₦50,000.00**
   - ❌ You **SHOULD NOT SEE** the Namibian borrower's N$5,000 request
7. **Take screenshot** of marketplace

#### Account 4: Namibian Lender
1. Open new incognito window
2. Go to: `http://localhost:3000/l/register`
3. Register with:
   - Email: `namibian.lender@test.com`
   - Password: `Test1234!`
   - **Country: Namibia (NA)**
4. Complete profile
5. Go to **Marketplace**: `http://localhost:3000/l/marketplace`
6. **EXPECTED RESULT**:
   - ✅ You **SHOULD SEE** the Namibian borrower's N$5,000 request
   - ✅ Amount shown as **N$5,000.00**
   - ❌ You **SHOULD NOT SEE** the Nigerian borrower's ₦50,000 request
7. **Take screenshot** of marketplace

---

## What You Should See

### Nigerian Lender Marketplace:
```
┌─────────────────────────────────────┐
│ Loan Requests                       │
├─────────────────────────────────────┤
│                                     │
│  ₦50,000.00                        │
│  Nigerian Borrower                  │
│  [Make Offer]                       │
│                                     │
└─────────────────────────────────────┘
Total: 1 request
```

### Namibian Lender Marketplace:
```
┌─────────────────────────────────────┐
│ Loan Requests                       │
├─────────────────────────────────────┤
│                                     │
│  N$5,000.00                        │
│  Namibian Borrower                  │
│  [Make Offer]                       │
│                                     │
└─────────────────────────────────────┘
Total: 1 request
```

---

## Test Results Checklist

### ✅ Currency Isolation
- [ ] Nigerian accounts see ₦ symbol
- [ ] Namibian accounts see N$ symbol
- [ ] No mixing of currency symbols

### ✅ Data Isolation
- [ ] Nigerian lender sees ONLY Nigerian borrowers
- [ ] Namibian lender sees ONLY Namibian borrowers
- [ ] No cross-country loan requests visible

### ✅ Country Filters
- [ ] Each lender sees exactly 1 request (their country only)
- [ ] If you create more requests in same country, count increases
- [ ] Requests from other countries never appear

---

## Quick Database Check (If You Have Supabase Studio Access)

1. Open Supabase Studio: `http://localhost:54323`
2. Go to **Table Editor** → `loan_requests`
3. You should see:
   - 1 row with `country_code = 'NG'` and `currency = 'NGN'`
   - 1 row with `country_code = 'NA'` and `currency = 'NAD'`
4. Go to **Table Editor** → `profiles`
5. You should see 4 profiles with different country_codes

---

## Video Proof Steps (Screen Recording)

1. **Start screen recording**
2. **Show Nigerian lender** marketplace (1 request in ₦)
3. **Switch to Namibian lender** marketplace (1 request in N$)
4. **Show that they're different** - side by side comparison
5. **Stop recording** - this is your proof!

---

## Common Issues

### "I see 0 requests in marketplace"
- **Cause**: Borrower didn't complete verification or admin didn't approve
- **Fix**: Make sure borrower's verification_status is 'approved' in database

### "I see requests from all countries"
- **Cause**: Database RLS policies not applied
- **Fix**: Run `supabase db reset` to reapply migrations

### "Currency still shows $"
- **Cause**: Currency not loaded from database
- **Fix**: Check browser console for errors, ensure country_currency_allowed has data

---

## Super Quick Visual Test

If you just want to see currencies working:

1. Visit: `http://localhost:3000/test-currency`
2. This page shows:
   - Your current country and currency
   - All 12 supported currencies formatted correctly
   - Visual confirmation that each country has unique currency

---

## Need Help?

If isolation isn't working:
1. Check browser console (F12) for errors
2. Verify you selected different countries during registration
3. Ensure loan requests have status = 'open'
4. Check borrower verification_status is 'approved'
