# Multi-Role System Implementation

**Date**: 2025-10-29
**Status**: ✅ **Implemented & Tested**
**Migration**: `20251029083015_add_multi_role_support.sql`

---

## 🎯 Overview

Credlio now supports **professional multi-role functionality**, allowing users to have **multiple roles simultaneously** (e.g., both Lender AND Borrower).

This is the same pattern used by:
- **Stripe** (customers can be both buyers and sellers)
- **PayPal** (users can send and receive)
- **Airbnb** (users can be both guests and hosts)
- **LinkedIn** (users can be both recruiters and job seekers)

---

## ✨ Key Features

### 1. **Multiple Roles Per User**
- ✅ One email = One account
- ✅ User can have BOTH lender AND borrower roles
- ✅ No need for separate email addresses
- ✅ Single login for all capabilities

### 2. **Smart Registration**
- **New User**: Creates account with requested role
- **Existing User**: Adds role to existing account (role upgrade)
- **Duplicate Role**: Prevents re-registration with same role

### 3. **Role Switcher UI**
- Shows in header when user has multiple roles
- One-click switching between Lender ↔ Borrower dashboards
- Badge shows total number of roles
- Clean, modern dropdown interface

### 4. **Backward Compatible**
- Existing code still works
- Old `profiles.app_role` column preserved
- New code uses `user_roles` table
- Zero breaking changes

---

## 🗄️ Database Schema

### New Table: `user_roles`
```sql
CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  role TEXT NOT NULL CHECK (role IN ('lender', 'borrower', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);
```

### Helper Functions
```sql
-- Check if user has specific role
user_has_role(user_id, 'lender') → true/false

-- Get all roles for user
get_user_roles(user_id) → [{ role, created_at }]

-- Add role (service role only)
add_user_role(user_id, 'lender')

-- Remove role (service role only)
remove_user_role(user_id, 'lender')
```

### Convenient View
```sql
SELECT * FROM user_roles_view;
-- Returns: user_id, full_name, email, roles[], is_lender, is_borrower, is_admin
```

---

## 🔄 Registration Flow

### Scenario 1: New User Registration
```
User registers as lender with new@example.com
→ Creates auth user
→ Creates profile
→ Adds 'lender' role to user_roles
→ Creates lender record
→ Redirects to profile completion
```

### Scenario 2: Existing Borrower → Lender
```
Borrower with borrower@example.com tries to register as lender
→ Detects existing user
→ Checks user_roles (has 'borrower')
→ Adds 'lender' role
→ Creates lender record
→ Shows success: "Lender role added!"
→ User now has BOTH roles
```

### Scenario 3: Duplicate Registration
```
Lender tries to register as lender again
→ Detects existing lender role
→ Error: "Already registered as lender. Please sign in."
→ Offers redirect to login page
```

---

## 🔐 Login & Access Control

### Login Flow
```javascript
1. User signs in with email/password
2. System fetches all roles from user_roles table
3. Checks if user has required role for portal:
   - /l/* requires 'lender' role
   - /b/* requires 'borrower' role
4. If user has required role → Allow access
5. If user doesn't have role → Show error + suggest registration
```

### Multi-Role Access
```
User with both 'lender' and 'borrower' roles:
- Can access /l/* (lender portal)
- Can access /b/* (borrower portal)
- Sees Role Switcher in header
- Can switch between portals with one click
```

---

## 🎨 Role Switcher Component

### Location
- **Component**: `components/RoleSwitcher.tsx`
- **Used in**: `app/l/layout.tsx` (header section)

### Features
- **Auto-detection**: Only shows if user has 2+ roles
- **Current role badge**: Highlights active role
- **Role count badge**: Shows total number of roles
- **One-click switching**: Navigates to appropriate dashboard
- **Modern UI**: Glassmorphism effects, smooth animations

### Example UI
```
┌─────────────────────────┐
│ [Lender Icon] Lender [2] ▼ │
└─────────────────────────┘
   ↓ Click to expand
┌─────────────────────────┐
│ Switch Role             │
├─────────────────────────┤
│ 🏢 Lender Dashboard    │ ← Current
│ 👤 Borrower Dashboard  │
├─────────────────────────┤
│ You have 2 active roles │
└─────────────────────────┘
```

---

## 🧪 Testing Guide

### Test 1: New Lender Registration
1. Go to `http://localhost:3000/l/register`
2. Register with a new email
3. ✅ Should create account with lender role
4. ✅ Should redirect to profile completion
5. Check database: `SELECT * FROM user_roles WHERE user_id = '...'`
6. ✅ Should see one row with role='lender'

### Test 2: Role Upgrade (Borrower → Lender)
1. Register as borrower: `http://localhost:3000/b/register` (email: test@example.com)
2. Complete borrower registration
3. Sign out
4. Go to `http://localhost:3000/l/register`
5. Register as lender with **same email** (test@example.com)
6. ✅ Should show success: "Lender role added to your existing account!"
7. Sign in at `http://localhost:3000/l/login`
8. ✅ Should see **Role Switcher** in header with badge showing "2"
9. Click Role Switcher
10. ✅ Should see both "Lender Dashboard" and "Borrower Dashboard" options
11. Click "Borrower Dashboard"
12. ✅ Should redirect to borrower portal

### Test 3: Duplicate Registration Prevention
1. Register as lender with lender@example.com
2. Complete registration
3. Sign out
4. Try to register again with same email as lender
5. ✅ Should show error: "Already registered as lender. Please sign in instead."
6. ✅ Should offer to redirect to login page

### Test 4: Login with Role Check
1. Register as borrower only (borrower-only@example.com)
2. Try to login at `/l/login` (lender portal)
3. ✅ Should show error: "You are registered as: borrower. This portal is for lenders only."
4. ✅ Should sign out automatically
5. Login at `/b/login` (borrower portal)
6. ✅ Should succeed and access borrower dashboard

### Test 5: Database Verification
```sql
-- Check user_roles table
SELECT * FROM public.user_roles;

-- Check users with multiple roles
SELECT
  user_id,
  ARRAY_AGG(role) as roles,
  COUNT(*) as role_count
FROM public.user_roles
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Use the convenient view
SELECT * FROM public.user_roles_view WHERE is_lender AND is_borrower;
```

---

## 📂 Files Modified

### Backend
1. **Migration**: `supabase/migrations/20251029083015_add_multi_role_support.sql`
   - Created `user_roles` table
   - Created helper functions
   - Created view
   - Made `profiles.app_role` nullable

2. **Registration API**: `app/api/auth/register-lender/route.ts`
   - Added role checking with `user_roles` table
   - Implemented role upgrade logic
   - Uses `add_user_role()` function

### Frontend
3. **Login Page**: `app/l/login/page.tsx`
   - Updated to check `user_roles` instead of `app_role`
   - Shows all user roles in error messages

4. **Registration Page**: `app/l/register/page.tsx`
   - Handles `upgraded` response
   - Shows success message for role upgrades

5. **Layout**: `app/l/layout.tsx`
   - Added RoleSwitcher import
   - Integrated RoleSwitcher in header

6. **Component**: `components/RoleSwitcher.tsx` *(NEW)*
   - Created role switcher UI component
   - Auto-detects multiple roles
   - Provides role switching functionality

---

## ✅ Verification Checklist

- [x] Migration tested with `supabase db reset`
- [x] `user_roles` table created with proper constraints
- [x] Helper functions working (add_user_role, remove_user_role, etc.)
- [x] Registration API updated to use multi-role system
- [x] Login logic updated to check user_roles table
- [x] Role Switcher component created and integrated
- [x] Backward compatibility maintained
- [x] RLS policies applied to user_roles table
- [x] No breaking changes to existing code

---

## 🚀 Production Deployment

### Pre-Deployment
1. ✅ Test all scenarios locally in Docker
2. ✅ Verify database migration runs successfully
3. ✅ Test registration flow (new user + upgrade)
4. ✅ Test login with multiple roles
5. ✅ Test role switcher UI

### Deployment Steps
1. Commit all changes to git
2. Push to staging branch first
3. Run migration on staging: `npx supabase db push` (after linking to staging)
4. Test on staging environment
5. Get approval for production
6. Deploy via CI/CD (DO NOT use `--remote` flags manually)
7. Monitor logs for any role-related errors

### Post-Deployment
1. Verify existing users can still login
2. Test new registrations
3. Test role upgrades
4. Check that role switcher appears for multi-role users

---

## 🔧 Troubleshooting

### Issue: "Failed to create profile"
**Cause**: app_role is still required (not nullable)
**Fix**: Migration makes it nullable. Run `supabase db reset` locally to apply.

### Issue: Role Switcher not showing
**Possible causes**:
1. User only has one role (component hides automatically)
2. user_roles table not populated
3. RoleSwitcher not imported in layout

**Debug**:
```sql
-- Check user's roles
SELECT * FROM user_roles WHERE user_id = 'USER_ID_HERE';
```

### Issue: Can't add second role
**Cause**: RLS policies or missing permissions
**Fix**: Use service role key in API (already implemented in register-lender route)

### Issue: Old code breaking
**Cause**: Some code still relies on profiles.app_role
**Fix**: Update code to use user_roles table instead, or keep app_role as fallback

---

## 📊 Benefits

### For Users
- ✅ Single account for all capabilities
- ✅ No need to remember multiple emails
- ✅ Seamless switching between roles
- ✅ Professional user experience

### For Business
- ✅ Easier user management
- ✅ Better data consistency
- ✅ Increased user engagement
- ✅ Scalable architecture
- ✅ Industry standard pattern

### For Development
- ✅ Clean database design
- ✅ Easy to add new roles (admin, agent, etc.)
- ✅ Backward compatible
- ✅ Well-documented
- ✅ Tested in Docker

---

## 🔮 Future Enhancements

### Potential Features
1. **Role Permissions Matrix**
   - Granular permissions per role
   - Custom capabilities

2. **Role-Based Analytics**
   - Track usage per role
   - User behavior analysis

3. **Admin Role**
   - Super user capabilities
   - System management

4. **Organization Roles**
   - Team management
   - Multi-user organizations

5. **Role Expiration**
   - Temporary roles
   - Trial periods

---

## 💡 Developer Notes

### Adding New Roles
```sql
-- Add new role type (e.g., 'admin')
-- Already supported in CHECK constraint: ('lender', 'borrower', 'admin')

-- Add admin role to user
SELECT add_user_role('user_id_here', 'admin');

-- Create admin-specific table if needed
CREATE TABLE admins (
  user_id UUID PRIMARY KEY REFERENCES profiles(user_id),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Querying Multi-Role Users
```sql
-- Find all users with both lender and borrower roles
SELECT * FROM user_roles_view
WHERE is_lender AND is_borrower;

-- Count users per role
SELECT role, COUNT(*) as user_count
FROM user_roles
GROUP BY role;

-- Find users with most roles
SELECT user_id, COUNT(*) as role_count
FROM user_roles
GROUP BY user_id
ORDER BY role_count DESC;
```

---

## 📝 Summary

**What Changed**:
- ✅ Added `user_roles` junction table
- ✅ Created helper functions for role management
- ✅ Updated registration to support role upgrades
- ✅ Updated login to check multiple roles
- ✅ Created Role Switcher UI component
- ✅ Maintained backward compatibility

**What Didn't Change**:
- ❌ No changes to lenders/borrowers tables
- ❌ No changes to auth system
- ❌ No breaking changes to existing code
- ❌ No impact on production data

**Risk Level**: 🟢 **LOW**
- Code-only changes for registration/login
- New migration tested in Docker
- Backward compatible
- Can be rolled back if needed

---

**Implemented by**: Claude Code
**Tested in**: Docker (Local Supabase)
**Ready for**: Staging → Production
**Documentation**: Complete ✅
