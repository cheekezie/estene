import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Boxes,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PARCEL_SIZES, PARCEL_SIZE_META } from '@estene/contracts/enums';
import { formatNaira, koboToNaira, nairaToKobo } from '@estene/contracts/money';
import {
  ProductInputSchema,
  type ProductDto,
  type WarehousingSettingsDto,
} from '@estene/contracts/warehouse';
import { formatDate } from '@estene/lib/date';
import { useDebounce } from '@estene/ui/hooks/useDebounce';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { EmptyState } from '@estene/ui/EmptyState';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@estene/ui/table';
import { Pagination } from '@/shared/components/Pagination';
import { QueryState } from '@/shared/components/QueryState';
import { StatTile } from '@/shared/components/StatTile';
import { useCan } from '@/shared/hooks/useCan';
import { useOffices } from '../offices/offices.queries';
import {
  useProducts,
  useSaveProduct,
  useSaveSettings,
  useWarehouseSummary,
  useWarehousingSettings,
} from '../warehouse/warehouse.queries';
import { useClientContext } from './ClientLayout';

/** /clients/:id/warehousing — switch store-and-ship on, choose the warehouse, manage the catalogue. */
export default function ClientWarehousingPage() {
  const { client, canManage } = useClientContext();
  const settings = useWarehousingSettings(client.id);
  const enabled = !!settings.data?.enabled;
  const summary = useWarehouseSummary(client.id, enabled);
  const [editing, setEditing] = useState(false);

  return (
    <QueryState isLoading={settings.isLoading} error={settings.error} onRetry={settings.refetch}>
      <div className="space-y-6">
        {!settings.data && !editing ? (
          <Card>
            <EmptyState
              icon={Warehouse}
              title="Warehousing is off"
              description="Store this client’s goods in an Estene warehouse and ship their orders on demand."
            />
            {canManage && (
              <div className="flex justify-center pb-8">
                <Button onClick={() => setEditing(true)}>Set up warehousing</Button>
              </div>
            )}
          </Card>
        ) : editing ? (
          <SettingsForm
            clientId={client.id}
            current={settings.data ?? null}
            onDone={() => setEditing(false)}
          />
        ) : (
          settings.data && (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Warehouse</p>
                  <p className="font-medium">
                    {settings.data.office.name} ({settings.data.office.code})
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Handling fee</p>
                  <Link
                    to={`/clients/${client.id}/handling-fees`}
                    className="text-primary font-medium hover:underline"
                  >
                    Per unit, monthly
                  </Link>
                </div>
                <div>
                  <p className="text-muted-foreground">Low stock at</p>
                  <p className="font-medium">≤ {settings.data.lowStockThreshold} units</p>
                </div>
                {settings.data.enabledAt && (
                  <div>
                    <p className="text-muted-foreground">Since</p>
                    <p className="font-medium">{formatDate(settings.data.enabledAt)}</p>
                  </div>
                )}
              </div>
              {canManage && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil />
                  Edit
                </Button>
              )}
            </Card>
          )
        )}

        {enabled && summary.data && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Units on hand"
              value={summary.data.unitsOnHand.toLocaleString()}
              hint={`${summary.data.products} products`}
              icon={Boxes}
            />
            <StatTile
              label="Low stock"
              value={summary.data.lowStock}
              icon={AlertTriangle}
              highlight={summary.data.lowStock > 0}
            />
            <StatTile
              label="Open orders"
              value={summary.data.openOrders}
              hint={
                summary.data.awaitingStock
                  ? `${summary.data.awaitingStock} waiting for stock`
                  : undefined
              }
              icon={PackageOpen}
              highlight={summary.data.awaitingStock > 0}
            />
            <StatTile
              label="Deliveries expected"
              value={summary.data.expectedInbounds}
              icon={PackagePlus}
            />
          </div>
        )}

        {enabled && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to={`/warehouse/stock?client=${client.id}`}>Stock</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/warehouse/orders?client=${client.id}`}>Orders</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/warehouse/inbound?client=${client.id}`}>Inbound</Link>
            </Button>
          </div>
        )}

        {settings.data && <Catalogue clientId={client.id} />}
      </div>
    </QueryState>
  );
}

function SettingsForm({
  clientId,
  current,
  onDone,
}: {
  clientId: string;
  current: WarehousingSettingsDto | null;
  onDone: () => void;
}) {
  const offices = useOffices();
  const save = useSaveSettings(clientId);
  const warehouses = (offices.data ?? []).filter((o) => o.isActive && o.isWarehouse);
  const [enabled, setEnabled] = useState(current?.enabled ?? true);
  const [officeId, setOfficeId] = useState(current?.office.id ?? '');
  const [threshold, setThreshold] = useState(String(current?.lowStockThreshold ?? 5));

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Warehousing settings</h2>
      <form
        className="grid max-w-2xl gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              enabled,
              officeId,
              lowStockThreshold: Math.max(0, Number(threshold) || 0),
            },
            {
              onSuccess: () => {
                toast.success('Warehousing settings saved');
                onDone();
              },
            },
          );
        }}
      >
        <Field
          label="Warehouse"
          className="sm:col-span-2"
          hint={
            warehouses.length === 0
              ? 'No office is marked as a warehouse yet — do that under Network → Offices.'
              : undefined
          }
        >
          <Select
            placeholder="Choose a warehouse"
            options={warehouses.map((o) => ({
              value: o.id,
              label: `${o.name} · ${o.zone.city} (${o.code})`,
            }))}
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
          />
        </Field>
        <Field label="Low stock alert at" hint="Units available or fewer.">
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Warehousing is on — accept orders and inbound deliveries
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={!officeId} loading={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Catalogue({ clientId }: { clientId: string }) {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const q = useProducts({ clientId, page, search: debounced || undefined });
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2 className="font-semibold">Products</h2>
        <div className="flex gap-2">
          <Input
            className="w-56"
            placeholder="Search SKU or name"
            aria-label="Search products"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {can('ops_manager', 'office_agent', 'support') && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              Add product
            </Button>
          )}
        </div>
      </div>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {q.data?.items.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No products yet"
            description="Add products here, or the client can create them through the API."
          />
        ) : (
          q.data && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH>Size</TH>
                    <TH className="text-right">Weight</TH>
                    <TH className="text-right">Unit value</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {q.data.items.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <span className="font-medium">{p.name}</span>
                        {!p.isActive && <Badge className="ml-2">Inactive</Badge>}
                        {p.fragile && (
                          <Badge tone="warning" className="ml-2">
                            Fragile
                          </Badge>
                        )}
                        <span className="text-muted-foreground block font-mono text-xs">
                          {p.sku}
                          {p.barcode && ` · ${p.barcode}`}
                        </span>
                      </TD>
                      <TD>{PARCEL_SIZE_META[p.size].label}</TD>
                      <TD className="tabular text-right">{p.weightKg} kg</TD>
                      <TD className="tabular text-right">{formatNaira(p.declaredValue)}</TD>
                      <TD className="text-right">
                        {can('ops_manager', 'office_agent', 'support') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil />
                          </Button>
                        )}
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
      {editing && (
        <ProductDialog
          clientId={clientId}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

/** The form edits `declaredValue` in whole naira; it is converted to kobo on submit. */
type FormIn = z.input<typeof ProductInputSchema>;
type FormOut = z.output<typeof ProductInputSchema>;

function ProductDialog({
  clientId,
  product,
  onClose,
}: {
  clientId: string;
  product: ProductDto | null;
  onClose: () => void;
}) {
  const save = useSaveProduct(clientId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(ProductInputSchema),
    defaultValues: product
      ? { ...product, declaredValue: koboToNaira(product.declaredValue) }
      : { size: 'small', fragile: false, isActive: true, declaredValue: 0 },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={product ? `Edit ${product.name}` : 'Add product'}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((input) =>
            save.mutate(
              {
                id: product?.id,
                input: { ...input, declaredValue: nairaToKobo(input.declaredValue) },
              },
              {
                onSuccess: () => {
                  toast.success(product ? 'Product updated' : 'Product added');
                  onClose();
                },
              },
            ),
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="SKU"
              error={errors.sku?.message}
              hint={product ? 'Can’t be changed' : undefined}
            >
              <Input className="font-mono" disabled={!!product} {...register('sku')} />
            </Field>
            <Field label="Name" className="sm:col-span-2" error={errors.name?.message}>
              <Input {...register('name')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Packed size">
              <Select
                options={PARCEL_SIZES.map((s) => ({ value: s, label: PARCEL_SIZE_META[s].label }))}
                {...register('size')}
              />
            </Field>
            <Field label="Weight (kg)" error={errors.weightKg?.message}>
              <Input type="number" step="0.01" {...register('weightKg', { valueAsNumber: true })} />
            </Field>
            <Field label="Unit value (₦)" error={errors.declaredValue?.message}>
              <Input
                type="number"
                step="1"
                {...register('declaredValue', { valueAsNumber: true })}
              />
            </Field>
          </div>
          <Field label="Barcode (optional)">
            <Input
              className="font-mono"
              {...register('barcode', { setValueAs: (v: string) => v || undefined })}
            />
          </Field>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" {...register('fragile')} />
              Fragile
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" {...register('isActive')} />
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
