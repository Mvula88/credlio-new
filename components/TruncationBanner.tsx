import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'

/**
 * Shows a small notice when a list has hit its row limit and may be
 * truncated. Used as a stopgap on pages that don't yet have pagination —
 * see the affordability/perf discussion for context.
 *
 * Render when count === limit. Defaults: limit 500.
 */
export function TruncationBanner({
  count,
  limit = 500,
}: { count: number; limit?: number }) {
  if (count < limit) return null
  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50">
      <Info className="h-4 w-4 text-amber-700" />
      <AlertDescription className="text-amber-900 text-sm">
        Showing the most recent {limit} entries. More may exist — full
        pagination will be added when needed.
      </AlertDescription>
    </Alert>
  )
}
