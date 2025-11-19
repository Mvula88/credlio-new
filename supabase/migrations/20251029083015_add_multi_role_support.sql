-- Migration: Add Multi-Role Support
-- Description: Allow users to have multiple roles (both lender AND borrower)
--
-- Changes:
-- 1. Create user_roles junction table
-- 2. Migrate existing app_role data to user_roles
-- 3. Keep app_role column for backward compatibility (will be deprecated)
-- 4. Add policies for user_roles table

-- ================================================
-- 1. Create user_roles junction table
-- ================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('lender', 'borrower', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

-- Add comment
COMMENT ON TABLE public.user_roles IS 'Junction table for multi-role support. Users can have multiple roles.';

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- ================================================
-- 2. Migrate existing data from profiles.app_role
-- ================================================

DO $$
BEGIN
  -- Only migrate if user_roles is empty (safe for re-running migration)
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN

    -- Migrate all existing profiles with app_role to user_roles
    INSERT INTO public.user_roles (user_id, role, created_at)
    SELECT
      user_id,
      app_role,
      created_at
    FROM public.profiles
    WHERE app_role IS NOT NULL
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE 'Migrated % existing roles to user_roles table',
      (SELECT COUNT(*) FROM public.user_roles);
  ELSE
    RAISE NOTICE 'user_roles table already has data, skipping migration';
  END IF;
END $$;

-- ================================================
-- 3. Enable Row Level Security
-- ================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users cannot insert their own roles (only admins via service role)
CREATE POLICY "Service role can insert roles" ON public.user_roles
  FOR INSERT
  WITH CHECK (false); -- Will be handled by service role key in API

-- Policy: Users cannot update their own roles
CREATE POLICY "Service role can update roles" ON public.user_roles
  FOR UPDATE
  USING (false);

-- Policy: Users cannot delete their own roles
CREATE POLICY "Service role can delete roles" ON public.user_roles
  FOR DELETE
  USING (false);

-- ================================================
-- 4. Create helper functions
-- ================================================

-- Function: Check if user has a specific role
CREATE OR REPLACE FUNCTION public.user_has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
    AND role = p_role
  );
END;
$$;

COMMENT ON FUNCTION public.user_has_role IS 'Check if a user has a specific role';

-- Function: Get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(p_user_id UUID)
RETURNS TABLE(role TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ur.role,
    ur.created_at
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
  ORDER BY ur.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_user_roles IS 'Get all roles for a specific user';

-- Function: Add role to user (for service role)
CREATE OR REPLACE FUNCTION public.add_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Update profiles.app_role if it's null (for backward compatibility)
  UPDATE public.profiles
  SET app_role = p_role
  WHERE user_id = p_user_id
  AND app_role IS NULL;
END;
$$;

COMMENT ON FUNCTION public.add_user_role IS 'Add a role to a user (service role only)';

-- Function: Remove role from user (for service role)
CREATE OR REPLACE FUNCTION public.remove_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
  AND role = p_role;

  -- Update profiles.app_role to first remaining role (for backward compatibility)
  UPDATE public.profiles
  SET app_role = (
    SELECT role
    FROM public.user_roles
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1
  )
  WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.remove_user_role IS 'Remove a role from a user (service role only)';

-- ================================================
-- 5. Update profiles table (backward compatibility)
-- ================================================

-- Keep app_role column but make it nullable for backward compatibility
-- New code should use user_roles table, but old code can still use app_role
DO $$
BEGIN
  -- Check if app_role exists and is NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'app_role'
    AND is_nullable = 'NO'
  ) THEN
    -- Make it nullable
    ALTER TABLE public.profiles ALTER COLUMN app_role DROP NOT NULL;
    RAISE NOTICE 'Made profiles.app_role nullable for backward compatibility';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.profiles.app_role IS 'DEPRECATED: Use user_roles table instead. Kept for backward compatibility.';

-- ================================================
-- 6. Create view for easy querying
-- ================================================

CREATE OR REPLACE VIEW public.user_roles_view AS
SELECT
  p.user_id,
  p.full_name,
  au.email,
  ARRAY_AGG(ur.role ORDER BY ur.created_at) AS roles,
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p.user_id AND role = 'lender') AS is_lender,
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p.user_id AND role = 'borrower') AS is_borrower,
  EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p.user_id AND role = 'admin') AS is_admin
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.user_id
LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
GROUP BY p.user_id, p.full_name, au.email;

COMMENT ON VIEW public.user_roles_view IS 'Convenient view for checking user roles';

-- Grant access to view
GRANT SELECT ON public.user_roles_view TO authenticated;

-- ================================================
-- Migration Complete
-- ================================================

-- Summary of changes:
--  Created user_roles junction table with RLS
--  Migrated existing app_role data
--  Created helper functions for role management
--  Made profiles.app_role nullable for backward compatibility
--  Created convenient view for role checking
--
-- Users can now have multiple roles simultaneously!
-- Example: A user can be both a lender AND a borrower
