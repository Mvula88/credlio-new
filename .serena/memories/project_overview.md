# Credlio Project Overview

## Project Description
Credlio is a credit reputation platform for lenders and borrowers operating across 12 African countries. It provides real-time borrower reputation data to help lenders make informed lending decisions and reduce default rates.

## Key Features
- **Dual Interface**: Separate portals for borrowers (`/b/` routes) and lenders (`/l/` routes)
- **Borrower Features**: Login, registration, loans, credit assessment, affordability check, repayments tracking
- **Lender Features**: Borrower search & registration, ID-based search, credit scoring, risk assessment, marketplace access (Pro+ tier)
- **Admin Dashboard**: Admin interface at `/admin/dashboard`
- **Security**: SHA-256 encryption, country-isolated data, no raw IDs/documents stored
- **Multi-country Support**: Operating in Nigeria, Kenya, South Africa, Ghana, Tanzania, Uganda, Namibia, Zambia, Malawi, Rwanda, Cameroon, Ivory Coast

## Tech Stack
- **Frontend**: Next.js 15.5, React 19, TypeScript 5.9
- **UI Components**: Radix UI, shadcn/ui, Tailwind CSS 4
- **State Management**: Zustand, React Query (TanStack Query)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Forms**: React Hook Form with Zod validation
- **Testing**: Playwright
- **Monitoring**: Sentry
- **Payments**: Stripe integration
- **Email**: Resend API

## Pricing Tiers
- **Pro ($12.99/month)**: Full borrower search, credit scores, risk flags, repayment tracking
- **Pro+ ($19.99/month)**: Everything in Pro + Marketplace access for loan requests

## Architecture
- Server-side rendering with Next.js App Router
- Edge functions for serverless compute
- Row-level security (RLS) in Supabase for data isolation
- Country-specific data isolation
- Local currency support per country