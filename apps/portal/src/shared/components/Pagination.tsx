import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@estene/ui/button';

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="tabular">{total.toLocaleString()} total</span>
      <div className="flex items-center gap-2">
        <span className="tabular">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
