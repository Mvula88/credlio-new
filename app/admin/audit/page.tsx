'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSearch, Loader2, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'

interface AuditRow {
  id: string
  actor_id: string | null
  actor_role: string | null
  actor_email: string | null
  action: string | null
  action_category: string | null
  target_type: string | null
  target_id: string | null
  old_data: unknown
  new_data: unknown
  metadata: unknown
  severity: string | null
  created_at: string
}

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'outline',
  warning: 'secondary',
  critical: 'destructive',
}

export default function AdminAuditLogPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [category, setCategory] = useState<string>('')
  const [targetType, setTargetType] = useState<string>('')
  const [severity, setSeverity] = useState<string>('')
  const supabase = createClient()

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('query_audit_logs', {
        p_action_category: category || null,
        p_target_type: targetType || null,
        p_target_id: null,
        p_actor_id: null,
        p_severity: severity || null,
        p_from_date: null,
        p_to_date: null,
        p_limit: 100,
        p_offset: 0,
      })
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      const result = data as { success?: boolean; error?: string; total?: number; data?: AuditRow[] }
      if (result?.error) {
        setError(result.error)
        return
      }
      setRows(result?.data ?? [])
      setTotal(result?.total ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setCategory('')
    setTargetType('')
    setSeverity('')
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileSearch className="h-7 w-7" />
          Audit Log
        </h1>
        <p className="text-muted-foreground mt-1">
          All recorded actions across the platform. Hash-chained for tamper detection.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filter by category, target type, or severity. Empty = match all.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="cat">Action Category</Label>
            <Input id="cat" placeholder="e.g. borrowers, loans, admin_quota_reset" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="target">Target Type</Label>
            <Input id="target" placeholder="e.g. borrowers, lenders" value={targetType} onChange={(e) => setTargetType(e.target.value)} />
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={severity || 'any'} onValueChange={(v) => setSeverity(v === 'any' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply
            </Button>
            <Button variant="outline" onClick={() => { reset(); load() }} disabled={loading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {total !== null ? `${total} total entries (showing first ${rows.length})` : `${rows.length} entries`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground py-8 text-center">No entries match these filters.</p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={SEVERITY_VARIANT[row.severity ?? 'info'] ?? 'outline'}>
                      {row.severity ?? 'info'}
                    </Badge>
                    <Badge variant="outline">{row.action_category ?? '—'}</Badge>
                    <span className="text-sm font-mono">{row.action ?? '—'}</span>
                    {row.target_type && (
                      <span className="text-xs text-muted-foreground">
                        on {row.target_type}{row.target_id ? ` · ${row.target_id.slice(0, 8)}…` : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss')}
                    {' · '}
                    {row.actor_email || row.actor_id?.slice(0, 8) || 'system'}
                    {row.actor_role ? ` (${row.actor_role})` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded({ ...expanded, [row.id]: !expanded[row.id] })}
                >
                  {expanded[row.id] ? 'Hide' : 'Details'}
                </Button>
              </div>
              {expanded[row.id] && (
                <pre className="mt-3 text-xs bg-gray-50 border p-3 rounded overflow-x-auto">
                  {JSON.stringify({
                    old_data: row.old_data,
                    new_data: row.new_data,
                    metadata: row.metadata,
                  }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
