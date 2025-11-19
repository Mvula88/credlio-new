# Supabase Safe Migration Workflow for Claude

## 🚨 CRITICAL RULES - MANDATORY FOR CLAUDE CODE
- **ALWAYS** test migrations locally with Docker first
- **ALWAYS** verify Docker is running before any database work
- **ALWAYS** use `supabase db reset` to test migrations locally
- **ALWAYS** get user confirmation before deploying to production
- **NEVER** deploy untested migrations to production
- **NEVER** skip Docker testing
- **NEVER** commit secrets or API keys
- **STOP** immediately on any error and ask for help
- **DOCUMENT** what each migration does before deploying

## 🔒 DOCKER-FIRST SAFETY PROTOCOL
Before ANY database operation, Claude MUST:
1. Verify Docker is running: `docker --version`
2. Verify local Supabase is running: `supabase status`
3. If not running, start it: `supabase start`
4. ONLY work with local database until explicitly told otherwise

## 📋 Prerequisites Check
Before any database work, verify:
```bash
# Check Docker is running
docker --version

# Check Supabase CLI is installed
supabase --version

# Check current project status
supabase status
```

## 🔄 Migration Workflow

### 1️⃣ Create Migration
```bash
# Create new migration file
supabase migration new <descriptive_name>
```
- Use descriptive names: `add_users_table`, `update_posts_rls`, etc.
- Migration file created in: `supabase/migrations/<timestamp>_<name>.sql`

**Migration SQL Best Practices:**
```sql
-- Always use IF NOT EXISTS for creates
CREATE TABLE IF NOT EXISTS public.users (...);

-- Wrap risky operations in transactions
BEGIN;
  -- your changes here
COMMIT;

-- Use DO blocks for conditional logic
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'users') THEN
    CREATE TABLE public.users (...);
  END IF;
END $$;
```

### 2️⃣ Test Locally with Docker
```bash
# Reset local database to clean state
supabase db reset

# Apply all migrations including new one
supabase migration up

# If errors occur:
# 1. Copy the exact error message
# 2. Fix the migration file
# 3. Run supabase db reset again
# 4. Repeat until successful
```

**Verify locally:**
```bash
# Check tables
supabase db query 'SELECT tablename FROM pg_tables WHERE schemaname = '"'"'public'"'"';'

# Test the application
pnpm dev
# Navigate to http://localhost:3000 and test features
```

### 3️⃣ Test on Staging (if available)
```bash
# Link to staging project
supabase link --project-ref <STAGING_PROJECT_REF>

# Push to staging
supabase db push --dry-run  # Preview changes first
supabase db push            # Apply changes

# Verify staging
supabase db query --use-remote 'SELECT version();'
```

### 4️⃣ Production Deployment

**✅ APPROVED METHOD (After Docker Testing):**
If Docker testing passes with no errors, Claude CAN deploy to remote using:
```bash
# Link to production project (if not already linked)
supabase link --project-ref <PROJECT_REF>

# Push migrations to remote
supabase db push
```

**REQUIREMENTS before remote deployment:**
1. ✅ Docker testing completed successfully with `supabase db reset`
2. ✅ No errors in migration application
3. ✅ User explicitly confirms deployment to production
4. ✅ Document what migration does and why

**Alternative CI/CD Method (if Git is set up):**
1. Commit migration files to git
2. Push to main branch
3. Let GitHub Actions handle production deployment
4. Manual approval required in GitHub

### 5️⃣ Post-Deployment Verification
```bash
# Verify tables exist
supabase db query --use-remote "
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public'
  ORDER BY table_name;
"

# Check RLS status
supabase db query --use-remote "
  SELECT schemaname, tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public';
"

# Verify policies
supabase db query --use-remote "
  SELECT tablename, policyname, cmd, roles 
  FROM pg_policies 
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
"
```

## 🔐 Security Checklist
- [ ] RLS enabled on all public tables
- [ ] Policies created for all operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] Service role key never exposed to client
- [ ] Anon key used only in client-side code
- [ ] Sensitive columns excluded from public API

## 🛟 Rollback Procedures

### Quick Fix (Forward migration)
```bash
# Create a fix migration
supabase migration new fix_<issue_description>
# Add SQL to fix the issue
# Test locally first, then deploy
```

### Emergency Rollback
```bash
# Restore from backup (production admin only)
# Contact team lead immediately
```

## 📁 Project Structure
```
credlio-new/
├── supabase/
│   ├── migrations/        # All migration files
│   ├── functions/         # Edge functions
│   ├── seed.sql          # Seed data for development
│   └── config.toml        # Supabase configuration
├── .env                   # Local environment variables
├── .env.local            # Local overrides (gitignored)
└── CLAUDE.md             # This file
```

## 🧪 Testing Commands for Development

### Start Local Supabase
```bash
# Start all services (requires Docker)
supabase start

# Local URLs:
# API:        http://localhost:54321
# Database:   http://localhost:54322
# Studio:     http://localhost:54323
```

### Stop Local Supabase
```bash
supabase stop
```

### Reset Database
```bash
# Wipe database and reapply all migrations
supabase db reset
```

### Run Tests
```bash
# Run application tests
pnpm test

# Test database queries
supabase db query 'SELECT * FROM public.users LIMIT 5;'
```

## 📝 Common Tasks

### Add a new table with RLS
```sql
-- Create table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own posts" ON public.posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own posts" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);
```

### Modify existing table
```sql
-- Always check if column exists first
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'published'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN published BOOLEAN DEFAULT false;
  END IF;
END $$;
```

## ⚠️ ABSOLUTELY FORBIDDEN - Claude Will REFUSE These
- ❌ `DROP TABLE` without `IF EXISTS`
- ❌ Push untested migrations (must test in Docker first)
- ❌ Skip local Docker testing
- ❌ Commit .env files with production keys
- ❌ Use production credentials locally
- ❌ Ignore migration errors
- ❌ Any operation that bypasses Docker testing
- ❌ Deploy to production without user confirmation

## 🆘 When Things Go Wrong
1. **Stop immediately** - Don't try to fix in production
2. **Document the error** - Screenshot or copy exact message
3. **Check backups** - Ensure recent backup exists
4. **Ask for help** - Share error with team
5. **Test fix locally** - Never experiment in production

Remember: **It's always better to ask for help than to break production!**

## 🤖 CLAUDE CODE BEHAVIOR CONTRACT
When working with databases, Claude Code WILL:
1. **ALWAYS** verify Docker is running first
2. **ALWAYS** use local Supabase for testing
3. **ALWAYS** test with `supabase db reset` locally before any remote deployment
4. **REQUIRE** successful Docker testing before production deployment
5. **ASK** for explicit user confirmation before deploying to production
6. **DOCUMENT** what the migration does before deploying
7. **FOLLOW** the approved workflow: Docker test → Confirm → Deploy

When deploying to production, Claude will:
1. Verify all Docker tests passed with no errors
2. Ask user to confirm deployment to production
3. Link to the correct project
4. Run `supabase db push` to apply migrations
5. Verify deployment succeeded