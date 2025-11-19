# Credlio Account System - Email & Role Management

## Overview

Credlio uses a **single email address per user** system with role-based access control. This means:
- ✅ One email can only register for **ONE account**
- ✅ Each account has a specific role: **Lender** or **Borrower**
- ❌ You cannot use the same email for both lender and borrower accounts

---

## How It Works

### 🔐 Account Registration

**When someone tries to sign up:**

1. **Email Check**: System checks if the email already exists
2. **Role Detection**: If email exists, system identifies the existing role
3. **Conflict Prevention**: Registration is blocked with a helpful error message

### 📧 Email Conflict Scenarios

#### Scenario 1: Email Already Registered as Lender

**What happens:**
```
User tries to register as lender with email@example.com
→ Email already exists as lender
→ Error: "This email is already registered as a lender. Please sign in instead."
→ User is prompted to go to login page
```

**What to do:**
- Use the login page instead of registration
- If you forgot your password, use the password reset feature

#### Scenario 2: Email Already Registered as Borrower

**What happens:**
```
User tries to register as lender with email@example.com
→ Email already exists as borrower
→ Error: "This email is already registered as a borrower. If you want to become a lender, please contact support."
```

**What to do:**
- Contact support to discuss role change or multi-role access
- Use a different email address for the lender account

#### Scenario 3: Wrong Portal Login

**What happens:**
```
Borrower tries to login at /l/login (lender portal)
→ Login succeeds but role check fails
→ Error: "You are registered as a borrower. This portal is for lenders only."
→ User is signed out automatically
```

**What to do:**
- Use the correct login portal for your role
- Lenders: `/l/login`
- Borrowers: `/b/login`

---

## 🎯 Portal URLs

### Lender Portal
- **Login**: `http://localhost:3000/l/login`
- **Register**: `http://localhost:3000/l/register`
- **Dashboard**: `http://localhost:3000/l/overview`

### Borrower Portal
- **Login**: `http://localhost:3000/b/login`
- **Register**: `http://localhost:3000/b/register`
- **Dashboard**: `http://localhost:3000/b/dashboard` (or similar)

---

## 🛡️ Security Features

### Email Uniqueness
- Enforced at Supabase Auth level
- Prevents duplicate accounts
- Ensures data integrity

### Role-Based Access Control (RBAC)
- Each user has exactly one role
- Role is set during registration
- Role is checked on every login
- Cannot access wrong portal even if authenticated

### Automatic Role Verification
```javascript
// On login, system checks:
1. Is user authenticated? ✓
2. Does user have a profile? ✓
3. Is user's role correct for this portal? ✓
   - If NO → Sign out + Show error
   - If YES → Allow access
```

---

## 🔄 Implementation Details

### Registration Flow (Lender)

```javascript
POST /api/auth/register-lender
{
  "email": "user@example.com",
  "password": "securepassword"
}

// Backend Process:
1. Check if email exists using admin.listUsers()
2. If exists:
   a. Get user's role from profile
   b. Return appropriate error:
      - "EMAIL_EXISTS_AS_LENDER" (409)
      - "EMAIL_EXISTS_AS_BORROWER" (409)
3. If not exists:
   a. Create auth user with role metadata
   b. Create profile record (app_role = 'lender')
   c. Create lender record
   d. Create subscription record (BASIC tier)
4. Return success or cleanup on error
```

### Login Flow (Lender)

```javascript
POST /api/auth/signin
{
  "email": "user@example.com",
  "password": "password"
}

// Frontend Process:
1. Authenticate with Supabase Auth ✓
2. Fetch user profile ✓
3. Check app_role === 'lender' ✓
   - If NO → Sign out + Error
   - If YES → Redirect to dashboard
```

---

## ⚠️ Error Messages

### User-Friendly Errors

| Error Code | Message | User Action |
|-----------|---------|-------------|
| `EMAIL_EXISTS_AS_LENDER` | "This email is already registered as a lender. Please sign in instead." | Go to login page |
| `EMAIL_EXISTS_AS_BORROWER` | "This email is already registered as a borrower. If you want to become a lender, please contact support." | Contact support or use different email |
| `WRONG_PORTAL` | "You are registered as a borrower. This portal is for lenders only." | Use correct portal |
| `PROFILE_NOT_FOUND` | "Profile not found. Please register first." | Complete registration |

---

## 🚀 Future Enhancements

### Potential Features

1. **Multi-Role Support**
   - Allow one user to have both lender and borrower roles
   - Add role switching UI
   - Requires database schema updates

2. **Role Upgrade System**
   - Allow borrowers to become lenders
   - Self-service upgrade flow
   - Verification process for new lenders

3. **Account Merging**
   - Merge separate lender/borrower accounts
   - Maintain transaction history
   - Complex data migration required

4. **Social Login Integration**
   - Google, Microsoft, etc.
   - Email verification still required
   - Role selection during signup

---

## 📝 Best Practices

### For Development

1. **Always check role before granting access**
   ```javascript
   // ❌ BAD
   if (user) {
     redirectToDashboard()
   }

   // ✅ GOOD
   if (user && profile.app_role === 'lender') {
     redirectToLenderDashboard()
   }
   ```

2. **Provide clear error messages**
   - Tell users WHY they can't access
   - Tell users WHAT to do next
   - Include links to correct pages

3. **Handle edge cases**
   - Missing profiles
   - Incomplete onboarding
   - Corrupted data

### For Users

1. **Remember your role**
   - Use the correct portal for your account type
   - Bookmark the correct login page

2. **Use different emails if needed**
   - If you need both roles, use separate emails
   - Or contact support for multi-role access

3. **Keep credentials secure**
   - Use strong, unique passwords
   - Enable 2FA when available

---

## 🔧 Troubleshooting

### Common Issues

**Q: I registered but can't login**
A: Make sure you're using the correct portal (/l/login for lenders, /b/login for borrowers)

**Q: I get "email already exists" error**
A: This email is already registered. Try logging in instead, or use password reset if you forgot your password.

**Q: I need both lender and borrower accounts**
A: Currently, you need to use different email addresses. Contact support for enterprise multi-role access.

**Q: Can I change my role from borrower to lender?**
A: Contact support. This requires manual verification and approval.

---

## 📞 Support

If you encounter any issues:
- Check this documentation first
- Verify you're using the correct portal
- Contact support with your email (don't include password!)
- Describe the exact error message you see

---

**Last Updated**: 2025-10-28
**Version**: 1.0
**Status**: ✅ Production Ready
