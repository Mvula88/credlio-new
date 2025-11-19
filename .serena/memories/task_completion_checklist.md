# Task Completion Checklist

## Before Marking Any Task Complete

### 1. Code Quality Checks
- [ ] Run linting: `pnpm lint`
- [ ] Fix any linting errors
- [ ] Ensure TypeScript has no type errors

### 2. Testing
- [ ] Test changes locally: `pnpm dev`
- [ ] Verify features work in the browser
- [ ] Run test suite if tests exist: `pnpm test`

### 3. Database Changes (if applicable)
- [ ] Test migrations locally with Docker first
- [ ] Run `supabase db reset` to verify migrations work
- [ ] Verify RLS policies are in place
- [ ] Test with local Supabase instance

### 4. Security Review
- [ ] No hardcoded secrets or API keys
- [ ] No exposed service role keys
- [ ] RLS enabled on new tables
- [ ] Sensitive data properly hashed

### 5. Final Verification
- [ ] Changes work as expected
- [ ] No console errors in browser
- [ ] UI is responsive and accessible
- [ ] Code follows project conventions

## Critical Rules (from CLAUDE.md)
- **NEVER** push directly to production
- **NEVER** use `supabase db push --remote`
- **ALWAYS** test with Docker locally first
- **ALWAYS** verify Docker is running before database work
- **STOP** immediately on any error and ask for help

## Deployment Workflow
1. Commit changes to git (when git is initialized)
2. Push to main branch
3. Let GitHub Actions handle production deployment
4. Manual approval required in GitHub