# Check Overdue Reports - Edge Function

This Edge Function automatically checks for overdue borrower reports and updates their status after the 7-day grace period.

## What It Does

1. **Finds Overdue Reports**: Queries all reports with status = 'unpaid' and due_date > 7 days ago
2. **Updates Status**: Changes status from 'unpaid' to 'overdue'
3. **Updates Credit Scores**: Applies penalty to borrower's credit score
4. **Sends Notifications**: Notifies both borrower and lender about the overdue status

## Local Testing

```bash
# Deploy function locally
supabase functions serve check-overdue-reports

# Test the function
curl -X POST http://localhost:54321/functions/v1/check-overdue-reports \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Production Deployment

### Deploy to Supabase

```bash
# Deploy the function
supabase functions deploy check-overdue-reports

# Set environment variables
supabase secrets set SUPABASE_URL=your_project_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Option 1: Supabase Cron Jobs (Recommended)

Set up a cron trigger in the Supabase Dashboard:

1. Go to **Database** → **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: Check Overdue Reports
   - **Schedule**: `0 2 * * *` (runs at 2 AM daily)
   - **Command**:
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-overdue-reports',
       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     ```

### Option 2: GitHub Actions

Create `.github/workflows/check-overdue-reports.yml`:

```yaml
name: Check Overdue Reports

on:
  schedule:
    - cron: '0 2 * * *' # Runs at 2 AM UTC daily

jobs:
  check-overdue:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-overdue-reports \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

### Option 3: Vercel Cron (If using Vercel)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-overdue-reports",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Then create the API route (already included at `/api/cron/check-overdue-reports`).

### Option 4: External Cron Service

Use services like:
- **cron-job.org** (free, reliable)
- **Upstash QStash** (serverless cron)
- **EasyCron**

Configure to call:
```
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-overdue-reports
Header: Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

## Response Format

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

Check function logs:

```bash
# View logs
supabase functions logs check-overdue-reports --tail

# View metrics in Supabase Dashboard
# Go to Edge Functions → check-overdue-reports → Metrics
```

## Grace Period Logic

- **7 Days**: After the due date, reports remain 'unpaid' for 7 days
- **Day 8+**: Automatically marked as 'overdue' and credit score is penalized
- **Notifications**: Both parties are notified when status changes to 'overdue'

## Security

- Function uses **service role key** for full database access
- Only authorized cron jobs should call this function
- Consider adding additional authentication if exposing publicly
