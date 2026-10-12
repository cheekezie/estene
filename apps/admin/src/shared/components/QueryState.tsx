import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@estene/ui/button';
import { Skeleton } from '@estene/ui/skeleton';
import { errorMessage } from '@estene/lib/errors';

/** Standard loading / error frame around a query's content. */
export function QueryState({ isLoading, error, onRetry, rows = 5, children }: { isLoading: boolean; error: unknown; onRetry?: () => void; rows?: number; children: ReactNode }) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
      </div>
    );
  }
  return <>{children}</>;
}
