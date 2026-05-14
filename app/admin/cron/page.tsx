'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Activity, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { format } from 'date-fns'

interface JobRun {
  id: string
  job_name: string
  started_at: string
  finished_at: string | null
  status: string | null
  error: string | null
  records_processed: number | null
}

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { variant: 'outline', icon: CheckCircle2 },
  failed: { variant: 'destructive', icon: AlertTriangle },
  running: { variant: 'secondary', icon: Clock },
}

export default function AdminCronPage() {
  const [rows, setRows] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_recent_job_runs', { p_limit: 50 })
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      setRows((data as JobRun[]) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job runs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7" />
            Cron Jobs
          </h1>
          <p className="text-muted-foreground mt-1">
            Recent runs of the daily maintenance pipeline (reminders, auto-flags, defaults, etc).
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
          <CardDescription>
            Newest first. The daily cron runs at 02:00 UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground py-8 text-center">No cron runs recorded yet.</p>
          )}
          {rows.map((row) => {
            const badge = STATUS_BADGE[row.status ?? 'running']
            const Icon = badge?.icon ?? Activity
            const durationMs = row.finished_at
              ? new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()
              : null
            return (
              <div key={row.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badge?.variant ?? 'outline'}>
                      <Icon className="h-3 w-3 mr-1" />
                      {row.status ?? 'unknown'}
                    </Badge>
                    <span className="font-mono text-sm">{row.job_name}</span>
                    {row.records_processed !== null && (
                      <span className="text-xs text-muted-foreground">
                        · {row.records_processed} record(s)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(row.started_at), 'yyyy-MM-dd HH:mm:ss')}
                    {durationMs !== null && (
                      <> · {(durationMs / 1000).toFixed(1)}s</>
                    )}
                  </div>
                </div>
                {row.error && (
                  <pre className="mt-2 text-xs bg-red-50 border border-red-200 text-red-900 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {row.error}
                  </pre>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
