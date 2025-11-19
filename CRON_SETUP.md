# Automated Grace Period System - Setup Guide

This guide explains how to set up the automated grace period system for borrower reports.

## Overview

The system automatically checks for overdue borrower reports daily and:
- Updates status from 'unpaid' to 'overdue' after 7 days past due date
- Applies credit score penalties
- Sends notifications to both borrowers and lenders

## How It Works





### Grace Period Logic

1. **Day 0-7**: Report remains 'unpaid' (grace period)
2. **Day 8+**: Automatically marked as 'overdue' by the cron job
3. **Notifications**: Both parties receive alerts
4. **Credit Impact**: Borrower's credit score is penalized

### Example Timeline

```
Loan Due Date:     October 1, 2025
Grace Period:      October 1-7, 2025 (7 days)
Auto-Overdue:      October 8, 2025 at 2 AM UTC
```

## Setup Options

You have **two implementation options**:

### Option 1: Vercel Cron (Easiest if using Vercel)

The project includes `vercel.json` with cron configuration.

**Steps:**
1. Deploy to Vercel
2. Add environment variable:
   - `CRON_SECRET`: A secure random string (optional but recommended)
3. Vercel automatically runs the cron job daily at 2 AM UTC

**No additional setup needed!**

### Option 2: Supabase Edge Function + External Cron

Use the Supabase Edge Function with any cron service.

**Steps:**

1. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy check-overdue-reports
   ```

2. **Choose a cron service:**
   - **Supabase Cron Jobs** (recommended)
   - **GitHub Actions** (free)
   - **cron-job.org** (free, reliable)
   - **Upstash QStash** (serverless)

3. **Configure the cron job** (see specific setup below)

## Detailed Setup Instructions

### A. Vercel Cron Setup

1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

2. **Add Environment Variable** (optional for security):
   ```bash
   vercel env add CRON_SECRET production
   # Enter a secure random string
   ```

3. **Verify in Vercel Dashboard:**
   - Go to your project → Settings → Cron Jobs
   - You should see: `/api/cron/check-overdue-reports` scheduled for `0 2 * * *`

4. **Test manually:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/check-overdue-reports \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

### B. Supabase Cron Jobs Setup

1. **Deploy Edge Function:**
   ```bash
   supabase functions deploy check-overdue-reports
   ```

2. **In Supabase Dashboard:**
   - Go to **Database** → **Cron Jobs** (requires pg_cron extension)
   - Click **Create a new cron job**
   - Name: `Check Overdue Reports`
   - Schedule: `0 2 * * *`
   - Command:
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-overdue-reports',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
       )
     );
     ```

### C. GitHub Actions Setup

1. **Create `.github/workflows/cron-check-overdue.yml`:**
   ```yaml
   name: Check Overdue Reports

   on:
     schedule:
       - cron: '0 2 * * *'  # 2 AM UTC daily
     workflow_dispatch:  # Allow manual trigger

   jobs:
     check-overdue:
       runs-on: ubuntu-latest
       steps:
         - name: Call Cron Endpoint
           run: |
             curl -X POST ${{ secrets.APP_URL }}/api/cron/check-overdue-reports \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
   ```

2. **Add GitHub Secrets:**
   - Repository → Settings → Secrets and variables → Actions
   - Add `APP_URL`: Your production URL
   - Add `CRON_SECRET`: Your cron secret

### D. External Cron Service (cron-job.org)

1. **Go to [cron-job.org](https://cron-job.org)**
2. **Create free account**
3. **Create new cron job:**
   - URL: `https://your-app.com/api/cron/check-overdue-reports`
   - Schedule: Every day at 2:00 AM
   - Request Method: POST
   - Request Headers:
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```

## Security

### Production Checklist

- [ ] Set `CRON_SECRET` environment variable
- [ ] Never commit `CRON_SECRET` to git
- [ ] Use HTTPS for all cron endpoints
- [ ] Monitor cron job logs for failures
- [ ] Set up error alerts (email/Slack)

### Recommended Secret Generation

```bash
# Generate a secure random secret
openssl rand -hex 32
```

Add this to your environment variables as `CRON_SECRET`.

## Testing

### Manual Testing (Development)

```bash
# Test locally (requires dev server running)
curl http://localhost:3003/api/cron/check-overdue-reports
```

### Manual Testing (Production)

```bash
# Test production endpoint
curl -X POST https://your-app.com/api/cron/check-overdue-reports \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "reportsChecked": 5,
  "reportsUpdated": 3,
  "notificationsCreated": 6,
  "timestamp": "2025-10-23T02:00:00.000Z"
}
```

## Monitoring

### Check Cron Job Execution

**Vercel:**
- Dashboard → Project → Logs → Filter by `/api/cron/check-overdue-reports`

**Supabase Edge Functions:**
```bash
supabase functions logs check-overdue-reports --tail
```

**GitHub Actions:**
- Repository → Actions → Check Overdue Reports workflow

### Set Up Alerts

Consider setting up alerts for:
- Cron job failures
- High number of overdue reports
- System errors

**Example: Slack webhook notification (optional)**
Add to the cron endpoint to send failure alerts.

## Troubleshooting

### Cron Not Running

1. **Check cron schedule:** Verify cron expression is correct
2. **Check logs:** Look for error messages
3. **Test manually:** Run the endpoint manually to see errors
4. **Verify secrets:** Ensure `CRON_SECRET` matches

### Reports Not Updating

1. **Check due_date:** Must be set and > 7 days ago
2. **Check status:** Must be 'unpaid'
3. **Check database:** Verify migration 015 is applied
4. **Check RLS policies:** Ensure service role has access

### Common Errors

**"Unauthorized"**
- CRON_SECRET is missing or incorrect

**"Failed to fetch overdue reports"**
- Database connection issue
- Migration 015 not applied

**"Failed to update credit score"**
- `refresh_borrower_score` function missing
- Check migration 013 is applied

## Cost Considerations

All options below are **free** for small to medium usage:

| Option | Cost | Limit |
|--------|------|-------|
| Vercel Cron | Free | 1 cron job on Hobby plan |
| GitHub Actions | Free | 2,000 minutes/month |
| cron-job.org | Free | Unlimited (with ads) |
| Supabase Edge Functions | Free | 500,000 requests/month |

For production at scale, consider:
- Vercel Pro: Unlimited cron jobs
- GitHub Teams: More minutes
- cron-job.org Pro: No ads, more features

## Support

If you encounter issues:
1. Check logs first
2. Test manually
3. Review this documentation
4. Check Supabase/Vercel status pages
5. File an issue in the repository

---

**Last Updated**: 2025-10-23
