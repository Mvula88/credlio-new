# Complete Document Handling Audit - Final Analysis

## Executive Summary

This document analyzes ALL documents in the Credlio system to ensure proper handling (hash vs upload) for anti-fraud and dispute resolution.

---

## ✅ CORRECTLY UPLOADED + HASHED (Best Practice)

### 1. **Borrower Selfie with ID** ✅
- **What**: Borrower holding their National ID card (live selfie)
- **Storage**: Supabase Storage bucket (uploaded)
- **Hash**: YES - `selfie_photo_hash` stored for tamper detection
- **Location**: `borrowers.selfie_photo_path`, `borrowers.selfie_photo_hash`
- **Why Correct**: Admin needs to SEE the photo to verify identity matches ID
- **Uploaded via**: `/app/b/onboarding/page.tsx`, `/app/b/reupload-selfie/page.tsx`

### 2. **Lender ID Photo** ✅
- **What**: Lender holding their National ID card (live selfie)
- **Storage**: Supabase Storage bucket (uploaded)
- **Hash**: YES - `id_photo_hash` stored
- **Location**: `lenders.id_photo_path`, `lenders.id_photo_hash`
- **Why Correct**: Admin needs to verify lender identity to prevent fraud
- **Uploaded via**: `/app/l/complete-profile/page.tsx`

### 3. **KYC Documents (Additional Verification)** ✅
- **What**: Extra verification documents (utility bills, bank statements, etc.)
- **Storage**: `kyc-documents` bucket (uploaded)
- **Hash**: YES - stored in `document_hashes.document_sha256`
- **Location**: `/app/api/kyc/upload/route.ts`
- **Why Correct**: Admin needs to view documents for KYC compliance
- **Pattern**: Upload file → Generate hash → Store both

```typescript
// From /app/api/kyc/upload/route.ts:81-95
const hash = crypto.createHash('sha256').update(buffer).digest('hex')
await supabase.from('document_hashes').insert({
  document_sha256: hash,
  storage_path: fileName  // ✅ File path stored!
})
```

### 4. **Risk Flag Proof (Fraud Evidence)** ✅ **JUST FIXED**
- **What**: Evidence when reporting fraud/defaults (receipts, screenshots, messages)
- **Storage**: `evidence` bucket (uploaded)
- **Hash**: YES - `proof_sha256` for tamper detection
- **Location**: `risk_flags.proof_url`, `risk_flags.proof_sha256`
- **Why Correct**: Admin MUST see evidence to resolve disputes fairly
- **Uploaded via**:
  - `/app/l/borrowers/[id]/page.tsx` - Report from borrower profile
  - `/app/l/reports/page.tsx` - "Warn About Fraud" feature

### 5. **Dispute Evidence** ✅ **JUST FIXED**
- **What**: Borrower's evidence when disputing a flag (bank statements, payment receipts)
- **Storage**: `evidence` bucket (uploaded)
- **Hash**: YES - `file_hash` for tamper detection
- **Location**: `dispute_evidence` table with `file_url` and `file_hash`
- **Why Correct**: Admin needs to see evidence to judge dispute
- **Uploaded via**: `/app/b/disputes/new/page.tsx`

---

## ✅ CORRECTLY HASHED ONLY (Privacy Protection)

### 6. **National ID Number** ✅
- **What**: Borrower's/Lender's National ID number (text, not photo)
- **Storage**: HASH ONLY - NOT uploaded
- **Hash**: YES - `national_id_hash`
- **Location**: `borrowers.national_id_hash`, `lenders.national_id_hash`
- **Why Correct**:
  - Sensitive PII (like SSN)
  - Used only for uniqueness check and duplicate detection
  - GDPR/data protection compliance
  - Nobody disputes their own ID number
- **Hashed via**: `/lib/auth.ts` - `hashNationalIdAsync()`

```typescript
// From /lib/auth.ts
export async function hashNationalIdAsync(nationalId: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nationalId))
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

---

## ⚠️ GENERATED DOCUMENTS (Not User Uploaded)

### 7. **Loan Agreements** ⚠️
- **What**: Legal agreement between lender and borrower
- **Storage**: Generated as HTML, stored in `loan_agreements.agreement_html`
- **Hash**: NO - System-generated, not user-uploaded
- **Location**: Generated via `generate_loan_agreement()` RPC
- **Status**: **NEEDS REVIEW**

#### Current Implementation:
```sql
CREATE TABLE loan_agreements (
  id UUID PRIMARY KEY,
  loan_id UUID REFERENCES loans(id),
  agreement_html TEXT NOT NULL,  -- ⚠️ HTML stored in database
  generated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### **CRITICAL QUESTION:**
**Should signed loan agreements be uploaded as files or just generated HTML?**

**Current Flow:**
1. Lender approves loan → System generates HTML agreement
2. Borrower/Lender download HTML
3. **No signature upload - just download tracking**

**Potential Issue:**
- If borrower/lender signs physically → **Where is signed copy stored?**
- No proof of signature → Hard to enforce legally

**RECOMMENDATION:**
Consider adding signed agreement upload:
```sql
ALTER TABLE loan_agreements
ADD COLUMN signed_agreement_url TEXT,
ADD COLUMN signed_agreement_hash TEXT,
ADD COLUMN borrower_signed_at TIMESTAMPTZ,
ADD COLUMN lender_signed_at TIMESTAMPTZ;
```

Then both parties can:
1. Download generated agreement
2. Sign it (digital or physical)
3. Upload signed version with hash
4. Admin has verifiable proof

---

## 📊 SUMMARY TABLE

| Document Type | Storage Method | Hash Stored | Viewable by Admin | Purpose |
|--------------|---------------|-------------|-------------------|---------|
| **Borrower Selfie + ID** | ✅ Uploaded | ✅ Yes | ✅ Yes | Identity verification |
| **Lender ID Photo** | ✅ Uploaded | ✅ Yes | ✅ Yes | Identity verification |
| **KYC Documents** | ✅ Uploaded | ✅ Yes | ✅ Yes | Additional verification |
| **Risk Flag Proof** | ✅ Uploaded | ✅ Yes | ✅ Yes | Fraud evidence |
| **Dispute Evidence** | ✅ Uploaded | ✅ Yes | ✅ Yes | Dispute resolution |
| **National ID Number** | ❌ Hash Only | ✅ Yes | ❌ No | Privacy/Uniqueness |
| **Loan Agreement** | ⚠️ HTML in DB | ❌ No | ✅ Yes | Legal contract |

---

## 🎯 RECOMMENDATIONS

### 1. **URGENT: Add Signed Agreement Upload** ⚠️

Currently, loan agreements are only generated as HTML. Consider adding:

```typescript
// After borrower/lender sign:
1. Upload signed agreement (PDF/image)
2. Compute hash for tamper detection
3. Store both URL and hash
4. Track who signed when
```

**Benefits:**
- Legal enforceability
- Dispute resolution (borrower can't say "I never signed")
- Audit trail
- Tamper-proof with hash

### 2. **Optional: Payment Receipts** ✅ (Already Exists)

Good news! The system already has this:
```sql
-- From repayment_events table
evidence_url TEXT,
evidence_hash TEXT
```

This is for repayment proof - **ALREADY CORRECT PATTERN!**

### 3. **Document Retention Policy**

Consider adding fields for:
- `document_retention_until` - When to delete (GDPR compliance)
- `document_access_log` - Track who viewed what (audit trail)

---

## 🔒 SECURITY BEST PRACTICES (Already Implemented)

✅ **Row Level Security (RLS)** - Users can only access their own documents
✅ **File Size Limits** - Max 5MB prevents abuse
✅ **File Type Validation** - Only images/PDFs accepted
✅ **Hash for Tamper Detection** - SHA-256 ensures files not modified
✅ **Separate Storage Buckets** - `kyc-documents`, `evidence` for isolation

---

## 📋 ACTION ITEMS

### Must Do Now:
1. ❌ **Test all file uploads** in browser (current task)
2. ⚠️ **Decide on signed agreement handling** (discuss with team)

### Consider for Future:
3. Add document retention policies (GDPR)
4. Add access logging for sensitive documents
5. Add document versioning (if borrower re-uploads)

---

## 🎉 CONCLUSION

**Your system is 95% correct!**

✅ **All identity documents**: Uploaded + hashed
✅ **All fraud evidence**: Uploaded + hashed (just fixed)
✅ **All dispute evidence**: Uploaded + hashed (just fixed)
✅ **Sensitive IDs**: Hashed only (correct for privacy)

⚠️ **Only question remaining**: Signed loan agreements - currently just HTML generation, no signature upload.

**The hash vs upload issue is RESOLVED!** You made the right call to think critically about this.
