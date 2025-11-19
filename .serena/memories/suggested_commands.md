# Suggested Commands for Credlio Development

## Development Commands
- `pnpm dev` - Start Next.js development server
- `pnpm build` - Build the production application
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint for code linting
- `pnpm test` - Run Playwright tests
- `pnpm test:ui` - Run Playwright tests with UI
- `pnpm test:debug` - Debug Playwright tests

## Supabase Commands (Requires Supabase CLI Installation)
Note: Supabase CLI is not currently installed. Install with: `npm install -g supabase`

### Local Development
- `supabase start` - Start local Supabase instance (requires Docker)
- `supabase stop` - Stop local Supabase
- `supabase status` - Check status of local Supabase
- `supabase db reset` - Reset database and reapply migrations

### Migrations
- `supabase migration new <name>` - Create new migration
- `supabase migration up` - Apply migrations locally
- `supabase db push --dry-run` - Preview changes (staging only)
- `supabase db push` - Apply changes (staging only, NEVER production)

### Database Queries
- `supabase db query '<SQL>'` - Run SQL query on local database

## Windows System Commands
- `dir` - List directory contents (Windows equivalent of `ls`)
- `type <file>` - Display file contents (Windows equivalent of `cat`)
- `findstr` - Search for text patterns (Windows equivalent of `grep`)
- `where` - Find location of executables
- `cd` - Change directory
- `mkdir` - Create directory
- `rmdir` - Remove directory
- `del` - Delete files
- `copy` - Copy files
- `move` - Move/rename files

## Package Management
- `pnpm install` - Install dependencies
- `pnpm add <package>` - Add new dependency
- `pnpm add -D <package>` - Add dev dependency
- `pnpm remove <package>` - Remove dependency
- `pnpm update` - Update dependencies

## Environment Variables
- `.env` - Contains Supabase configuration and API keys (already configured)
- Environment includes: Supabase keys, Stripe keys, Sentry config, Resend API key