# Credlio Project Structure

## Root Directory
```
credlio-new/
├── app/                    # Next.js App Router pages
│   ├── b/                 # Borrower portal routes
│   │   ├── login/
│   │   ├── register/
│   │   ├── overview/
│   │   ├── loans/
│   │   ├── credit/
│   │   ├── affordability/
│   │   ├── repayments/
│   │   ├── requests/
│   │   └── settings/
│   ├── l/                 # Lender portal routes
│   │   ├── login/
│   │   ├── register/
│   │   ├── overview/
│   │   ├── borrowers/
│   │   ├── loans/
│   │   ├── marketplace/
│   │   └── repayments/
│   ├── admin/            # Admin dashboard
│   │   └── dashboard/
│   └── page.tsx          # Landing page (lender-focused)
├── components/           # Reusable React components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions and configurations
├── src/                 # Additional source files
├── supabase/           # Supabase configuration
│   ├── migrations/     # Database migrations (10 files)
│   ├── functions/      # Edge functions
│   ├── config.toml     # Supabase config
│   └── seed.sql       # Seed data
├── tests/              # Test files
└── Configuration files:
    ├── .env            # Environment variables (configured)
    ├── CLAUDE.md       # Development guidelines
    ├── package.json    # Dependencies and scripts
    ├── tsconfig.json   # TypeScript config
    ├── tailwind.config.ts
    ├── next.config.ts
    └── playwright.config.ts
```

## Database Structure (from migrations)
1. **001_create_enums.sql** - Enum types for statuses
2. **002_create_countries_and_currencies.sql** - Country/currency data
3. **003_create_core_tables.sql** - Core user/profile tables
4. **004_create_loan_tables.sql** - Loan management tables
5. **005_create_marketplace_tables.sql** - Marketplace functionality
6. **006_create_support_tables.sql** - Support/help tables
7. **007_create_views_and_functions.sql** - Database views/functions
8. **008_create_loan_functions.sql** - Loan-specific functions
9. **009_create_risk_engine.sql** - Risk assessment logic
10. **010_create_rls_policies.sql** - Row-level security

## Key Features by Route
- **Borrower Portal** (`/b/*`): Account management, loan requests, credit monitoring
- **Lender Portal** (`/l/*`): Borrower search, risk assessment, loan management
- **Admin Dashboard** (`/admin/*`): Platform administration
- **Public Pages**: Landing page, pricing, documentation

## External Services
- **Supabase**: Database, auth, storage, realtime
- **Stripe**: Payment processing for subscriptions
- **Sentry**: Error monitoring and reporting
- **Resend**: Email delivery service