-- Test: Make inekela34@gmail.com an admin (LOCAL DATABASE ONLY)

-- Step 1: Check if user exists
SELECT id, email FROM auth.users WHERE email = 'inekela34@gmail.com';

-- Step 2: Add admin role to user_roles table
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'inekela34@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 3: Update profiles table to admin role
UPDATE profiles
SET app_role = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'inekela34@gmail.com'
);

-- Step 4: Verify the changes
SELECT
  u.email,
  p.app_role as profile_role,
  ARRAY_AGG(ur.role) as user_roles
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
LEFT JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'inekela34@gmail.com'
GROUP BY u.id, u.email, p.app_role;
