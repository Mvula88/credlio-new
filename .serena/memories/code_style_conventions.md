# Code Style and Conventions

## TypeScript/React Conventions
- **TypeScript**: Strict mode enabled, using TypeScript 5.9
- **React**: Using React 19 with Next.js 15 App Router
- **Components**: Functional components with hooks
- **File Structure**: 
  - Pages in `app/` directory following Next.js App Router conventions
  - Components in `components/` directory
  - Hooks in `hooks/` directory
  - Library utilities in `lib/` directory

## Naming Conventions
- **Components**: PascalCase (e.g., `LenderLandingPage`)
- **Functions**: camelCase
- **Files**: kebab-case for routes, PascalCase for components
- **Database**: snake_case for tables and columns

## UI Development
- **Component Library**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with custom configuration
- **Forms**: React Hook Form with Zod validation
- **Icons**: Lucide React icons

## Database Conventions
- **Migrations**: Numbered SQL files in `supabase/migrations/`
- **RLS**: Row-level security enabled on all public tables
- **Naming**: 
  - Tables: plural, snake_case (e.g., `users`, `loan_requests`)
  - Enums: snake_case with descriptive names
  - Functions: snake_case with clear action verbs

## State Management
- **Client State**: Zustand for global state
- **Server State**: TanStack Query for data fetching and caching
- **Forms**: React Hook Form for form state

## Error Handling
- **Monitoring**: Sentry integration for error tracking
- **User Feedback**: Sonner for toast notifications

## Security Best Practices
- Never expose service role keys to client
- Use anon key for client-side operations
- Enable RLS on all public tables
- Hash sensitive data (IDs, documents)
- Country-specific data isolation