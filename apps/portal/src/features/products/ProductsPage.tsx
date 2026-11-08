import { useState } from 'react';
import { Pencil, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { PARCEL_SIZES, PARCEL_SIZE_META, type ParcelSize } from '@estene/contracts/enums';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import { ProductInputSchema, type ProductDto } from '@estene/contracts/warehouse';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { PageHeader } from '@/shared/components/PageHeader';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { blank, fieldErrors } from '@/shared/forms';
import { useProducts, useSaveProduct } from './products.queries';

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const q = useProducts({ page, search: debounced || undefined });
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue. Add a product before sending us its stock."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            Add product
          </Button>
        }
      />
      <Card>
        <div className="border-b p-4">
          <Input
            className="max-w-xs"
            placeholder="Search SKU, name or barcode"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
          {q.data && q.data.items.length === 0 ? (
            <EmptyState icon={Tag} title="No products yet" />
          ) : (
            q.data && (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>SKU</TH>
                      <TH>Name</TH>
                      <TH>Size</TH>
                      <TH className="text-right">Weight</TH>
                      <TH className="text-right">Unit value</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {q.data.items.map((p) => (
                      <TR key={p.id}>
                        <TD className="font-mono text-sm">{p.sku}</TD>
                        <TD>
                          {p.name}
                          {!p.isActive && <Badge className="ml-2">Inactive</Badge>}
                          {p.fragile && (
                            <Badge tone="warning" className="ml-2">
                              Fragile
                            </Badge>
                          )}
                        </TD>
                        <TD className="text-sm">{PARCEL_SIZE_META[p.size].label}</TD>
                        <TD className="tabular text-right">{p.weightKg} kg</TD>
                        <TD className="tabular text-right">{formatNaira(p.declaredValue)}</TD>
                        <TD className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil />
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <Pagination
                  page={q.data.page}
                  totalPages={q.data.totalPages}
                  total={q.data.total}
                  onPage={setPage}
                />
              </>
            )
          )}
        </QueryState>
      </Card>
      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ProductDialog({ product, onClose }: { product: ProductDto | null; onClose: () => void }) {
  const save = useSaveProduct();
  const [f, setF] = useState({
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    barcode: product?.barcode ?? '',
    size: (product?.size ?? 'small') as ParcelSize,
    weightKg: product ? String(product.weightKg) : '',
    declaredValue: product ? String(koboToNaira(product.declaredValue)) : '0',
    fragile: product?.fragile ?? false,
    isActive: product?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={product ? `Edit ${product.name}` : 'Add product'}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = ProductInputSchema.safeParse({
              sku: f.sku,
              name: f.name,
              barcode: blank(f.barcode),
              size: f.size,
              weightKg: Number(f.weightKg),
              declaredValue: nairaToKobo(Number(f.declaredValue) || 0),
              fragile: f.fragile,
              isActive: f.isActive,
            });
            if (!parsed.success) return setErrors(fieldErrors(parsed.error));
            setErrors({});
            save.mutate(
              { sku: product?.sku, input: parsed.data },
              {
                onSuccess: () => {
                  toast.success(product ? 'Product updated' : 'Product added');
                  onClose();
                },
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="SKU" error={errors.sku} hint={product ? 'Can’t be changed' : undefined}>
              <Input
                className="font-mono"
                disabled={!!product}
                value={f.sku}
                onChange={(e) => set({ sku: e.target.value })}
              />
            </Field>
            <Field label="Name" className="sm:col-span-2" error={errors.name}>
              <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Packed size">
              <Select
                options={PARCEL_SIZES.map((s) => ({ value: s, label: PARCEL_SIZE_META[s].label }))}
                value={f.size}
                onChange={(e) => set({ size: e.target.value as ParcelSize })}
              />
            </Field>
            <Field label="Weight (kg)" error={errors.weightKg}>
              <Input
                type="number"
                step="0.01"
                value={f.weightKg}
                onChange={(e) => set({ weightKg: e.target.value })}
              />
            </Field>
            <Field label="Unit value (₦)" error={errors.declaredValue}>
              <Input
                type="number"
                step="1"
                value={f.declaredValue}
                onChange={(e) => set({ declaredValue: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Barcode (optional)" error={errors.barcode}>
            <Input
              className="font-mono"
              value={f.barcode}
              onChange={(e) => set({ barcode: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={f.fragile}
                onChange={(e) => set({ fragile: e.target.checked })}
              />
              Fragile
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={f.isActive}
                onChange={(e) => set({ isActive: e.target.checked })}
              />
              Active — can be ordered
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {product ? 'Save' : 'Add product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
