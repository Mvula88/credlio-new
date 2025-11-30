# Hash vs Upload Analysis - Critical for Dispute Resolution

## Executive Summary

After analyzing the entire codebase, I found **3 types of hashed documents** with different purposes. Some should stay hashed for privacy, others MUST be uploaded for dispute resolution.

---

## 1. NATIONAL ID HASH ✅ **KEEP HASHED - CORRECT**

### Current Implementation:
- **Table:** `borrowers.national_id_hash`
- **What:** SHA-256 hash of borrower's national ID number
- **Used for:** Uniqueness check, duplicate detection, privacy protection

### Example:
```typescript
// In borrower registration
national_id_hash: sha256("GH-123-4567-8901")
// Result: "a3f5b9c2d8e1f4a7..."
```

### Why Hash is CORRECT:
✅ **Privacy:** National ID is sensitive personal data (like SSN)
✅ **Compliance:** GDPR/data protection laws require minimal storage
✅ **Functionality:** Hash is sufficient for duplicate detection
✅ **No disputes:** Nobody disputes someone's national ID

### Database Evidence:
```sql
-- From 003_create_core_tables.sql:35
national_id_hash TEXT NOT NULL, -- SHA-256 hash of national ID
UNIQUE(country_code, national_id_hash)
```

### **VERDICT: ✅ KEEP HASHED**

---

## 2. RISK FLAG PROOF HASH ❌ **WRONG - NEEDS FILE UPLOAD**

### Current Implementation:
- **Table:** `risk_flags.proof_sha256`
- **What:** SHA-256 hash of evidence document (receipt, screenshot, etc.)
- **Used for:** Lenders reporting fraud/defaults

### Example:
```typescript
// When lender reports borrower
proof_sha256: "a3f5b9c2d8e1f4a7..." // Hash of receipt.pdf
```

### Why This is PROBLEMATIC:
❌ **Dispute issues:** When borrower challenges flag, admin needs to SEE the proof
❌ **No verification:** Admin can't verify hash without seeing original document
❌ **Lender burden:** Lender must keep file forever on their device
❌ **File loss risk:** What if lender loses the file?
❌ **Trust issues:** No way to prove evidence is authentic

### Real-World Problem:
```
Scenario:
1. Lender reports: "Borrower defaulted on $500"
   - Uploads hash: "a3f5b9c2..."
   - Keeps receipt.pdf on laptop

2. Borrower disputes: "That's false! I paid!"

3. Admin investigates:
   - Admin asks lender: "Send me the proof"
   - Lender: "Oh no, I formatted my laptop!" 😱
   - Admin: "Can't verify, removing flag"
   - Result: Fraudster gets clean record
```

### Code Location:
```typescript
// app/l/borrowers/[id]/page.tsx:559
proof_sha256: reportProof || null,

// app/l/borrowers/[id]/page.tsx:1739
<Input
  placeholder="SHA-256 hash of supporting evidence"
  value={reportProof}
  onChange={(e) => setReportProof(e.target.value)}
/>
```

### Database Constraint:
```sql
-- From 003_create_core_tables.sql:90-93
CONSTRAINT valid_proof CHECK (
  (origin = 'LENDER_REPORTED' AND proof_sha256 IS NOT NULL) OR
  origin = 'SYSTEM_AUTO'
)
```
**This REQUIRES proof hash but has no way to verify it!**

### **VERDICT: ❌ CHANGE TO FILE UPLOAD**

---

## 3. DISPUTE EVIDENCE HASH ❌ **WRONG - NEEDS FILE UPLOAD**

### Current Implementation:
- **Table:** `disputes.evidence_hashes` (array)
- **What:** SHA-256 hashes of evidence files uploaded by borrower
- **Used for:** Borrowers disputing flags/charges

### Example:
```typescript
// app/b/disputes/new/page.tsx:75-82
// Hash evidence files (don't upload actual files for privacy)
const evidenceHashes: string[] = []
for (const file of evidenceFiles) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashHex = /* ... */
  evidenceHashes.push(hashHex)
}
```

### Why This is PROBLEMATIC:
❌ **Admin can't see evidence:** Files never uploaded, only hashes stored
❌ **Borrower burden:** Must keep files on device forever
❌ **Dispute resolution impossible:** Admin can't judge dispute without seeing evidence
❌ **Defeats purpose:** Why collect evidence if nobody can view it?

### Real-World Problem:
```
Scenario:
1. Lender reports: "Borrower never paid"
2. Borrower disputes: "I paid! Here's my bank statement!"
   - Uploads file → System hashes it
   - Hash stored: "b4c6d9e2..."
   - Actual file: Lost after upload ❌

3. Admin reviews dispute:
   - Sees hash: "b4c6d9e2..."
   - Admin: "What is this? Can't see the evidence!"
   - Borrower: "I already uploaded it!"
   - Admin: "I only see a hash, not the document"
   - Result: Can't resolve dispute 😡
```

### **VERDICT: ❌ CHANGE TO FILE UPLOAD**

---

## 4. DOCUMENT VERIFICATIONS (KYC) ✅ **ALREADY USING FILE UPLOAD**

### Current Implementation:
- **Table:** `document_verifications` with actual file URLs
- **What:** ID photos, selfies, verification documents
- **Storage:** Supabase Storage with URLs

### Code Evidence:
```typescript
// app/api/kyc/upload/route.ts:87-93
// Save document record using document_hashes table
.from('document_hashes')
.insert({
  borrower_id,
  lender_id,
  document_sha256: hash,  // ✅ Hash for tamper detection
  // ✅ Actual file stored in Supabase Storage
})
```

### Why This is CORRECT:
✅ **File uploaded:** Actual document stored in secure storage
✅ **Hash included:** SHA-256 hash for tamper detection
✅ **Admin can verify:** Can view document in dashboard
✅ **Audit trail:** Know if file was modified
✅ **Best of both worlds:** File access + hash security

### **VERDICT: ✅ CORRECT - KEEP AS IS**

---

## 5. REPAYMENT EVIDENCE ⚠️ **MIXED - NEEDS REVIEW**

### Current Implementation:
- **Table:** `repayment_events.evidence_url` and `evidence_hash`
- **What:** Proof of payment (receipts, transaction screenshots)

### Database Schema:
```sql
-- From 004_create_loan_tables.sql:47-48
evidence_url TEXT,
evidence_hash TEXT,
```

### Status:
⚠️ **OPTIONAL:** Not required, but available
✅ **CORRECT APPROACH:** URL for file + hash for verification

### **VERDICT: ✅ CORRECT PATTERN - USE THIS EVERYWHERE**

---

## RECOMMENDATIONS

### 🔴 HIGH PRIORITY: Fix These NOW

#### 1. Risk Flag Proof (CRITICAL)
**Change:** `risk_flags.proof_sha256` → Add `proof_url` column

**Migration needed:**
```sql
ALTER TABLE public.risk_flags
ADD COLUMN proof_url TEXT;

-- Update constraint to require EITHER hash OR file
ALTER TABLE public.risk_flags
DROP CONSTRAINT valid_proof;

ADD CONSTRAINT valid_proof CHECK (
  (origin = 'LENDER_REPORTED' AND
   (proof_sha256 IS NOT NULL OR proof_url IS NOT NULL)) OR
  origin = 'SYSTEM_AUTO'
);
```

**UI Changes:**
- Replace hash input with file upload button
- Upload to Supabase Storage
- Store both URL and hash
- Admin can view file directly

**Impact:**
- ✅ Admins can verify evidence
- ✅ Disputes resolved faster
- ✅ No file loss issues
- ✅ Better fraud protection

#### 2. Dispute Evidence (CRITICAL)
**Change:** `disputes.evidence_hashes` → Create `dispute_evidence` table

**Already exists!**
```sql
-- From 20251108170559_add_platform_wide_enhancements.sql:300
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id UUID PRIMARY KEY,
  dispute_id UUID REFERENCES disputes(id),
  file_url TEXT NOT NULL,  -- ✅ Actual file!
  file_hash TEXT,  -- ✅ Hash for tamper detection
  evidence_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id)
);
```

**Fix needed:**
- Update `app/b/disputes/new/page.tsx` to USE this table
- Remove hash-only code
- Upload files to Supabase Storage
- Store in `dispute_evidence` table

---

## FINAL SUMMARY

### ✅ KEEP HASHED (Privacy/Security)
1. **National ID numbers** - Sensitive PII, hash is sufficient

### ❌ CHANGE TO UPLOAD (Dispute Resolution)
1. **Risk flag proof** - Admin needs to see evidence
2. **Dispute evidence** - Admin must view to judge fairly

### ✅ ALREADY CORRECT (Reference Pattern)
1. **KYC documents** - Files uploaded + hash stored
2. **Repayment evidence** - Optional file upload with hash

---

## THE GOLDEN RULE

**If someone might need to VERIFY or DISPUTE it later:**
→ **UPLOAD THE FILE + STORE HASH**

**If it's just for PRIVACY or UNIQUENESS:**
→ **HASH ONLY IS FINE**

---

## ACTION ITEMS

1. ✅ Keep `national_id_hash` as is
2. ❌ Add file upload for `risk_flags.proof_url`
3. ❌ Fix dispute evidence to use `dispute_evidence` table with files
4. ✅ Use KYC pattern (file + hash) for all evidence going forward

**Priority:** HIGH - Dispute resolution currently broken!
