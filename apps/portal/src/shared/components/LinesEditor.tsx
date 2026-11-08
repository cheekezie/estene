import { Plus, Trash2 } from 'lucide-react';
import type { ProductDto } from '@estene/contracts/warehouse';
import { Button } from '@estene/ui/button';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';

export type Line = { productId: string; qty: number };

/** Product + quantity rows for orders and inbounds. A product can appear once. */
export function LinesEditor({
  products,
  lines,
  onChange,
  available,
}: {
  products: ProductDto[];
  lines: Line[];
  onChange: (lines: Line[]) => void;
  /** Optional: available units per product id, shown as a hint. */
  available?: Map<string, number>;
}) {
  const set = (i: number, patch: Partial<Line>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const taken = new Set(lines.filter((_, j) => j !== i).map((l) => l.productId));
        const avail = available?.get(line.productId);
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Select
                aria-label="Product"
                placeholder="Choose a product"
                options={products
                  .filter((p) => !taken.has(p.id))
                  .map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))}
                value={line.productId}
                onChange={(e) => set(i, { productId: e.target.value })}
              />
              {line.productId && avail !== undefined && (
                <p
                  className={`mt-1 text-xs ${avail < line.qty ? 'text-warning' : 'text-muted-foreground'}`}
                >
                  {avail} available
                  {avail < line.qty && ' — the order will wait for stock'}
                </p>
              )}
            </div>
            <Input
              aria-label="Quantity"
              type="number"
              min={1}
              className="w-24"
              value={line.qty}
              onChange={(e) => set(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove line"
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={lines.length >= products.length}
        onClick={() => onChange([...lines, { productId: '', qty: 1 }])}
      >
        <Plus />
        Add product
      </Button>
    </div>
  );
}
