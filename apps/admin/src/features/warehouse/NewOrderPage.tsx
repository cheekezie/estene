import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  SERVICE_LEVELS,
  SERVICE_LEVEL_META,
  type DeliveryMode,
  type ServiceLevel,
} from '@estene/contracts/enums';
import { AdminOrderCreateSchema } from '@estene/contracts/warehouse';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Textarea } from '@estene/ui/textarea';
import { PageHeader } from '@/shared/components/PageHeader';
import { officeOptions, useOffices } from '../offices/offices.queries';
import { AreaSelect } from '../shipments/components/AreaSelect';
import { useZones } from '../zones/zones.queries';
import { ClientPicker } from './components/ClientPicker';
import { LinesEditor, type Line } from './components/LinesEditor';
import {
  useCreateOrder,
  useProductOptions,
  useSelectedClient,
  useStock,
} from './warehouse.queries';

/** Staff key in an order for a warehousing client — e.g. one phoned in or sent on WhatsApp. */
export default function NewOrderPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useSelectedClient();
  const products = useProductOptions(clientId);
  const stock = useStock({ clientId, page: 1 });
  const zones = useZones();
  const offices = useOffices();
  const create = useCreateOrder();

  const [lines, setLines] = useState<Line[]>([{ productId: '', qty: 1 }]);
  const [recipient, setRecipient] = useState({
    contactName: '',
    phone: '',
    zoneId: '',
    area: '',
    address: '',
    landmark: '',
  });
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('door');
  const [destinationOfficeId, setDestinationOfficeId] = useState('');
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>('standard');
  const [paymentMethod, setPaymentMethod] = useState<'on_account' | 'cash_on_delivery'>(
    'on_account',
  );
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const available = useMemo(
    () => new Map((stock.data?.items ?? []).map((s) => [s.product.id, s.available])),
    [stock.data],
  );
  const set = (patch: Partial<typeof recipient>) => setRecipient((r) => ({ ...r, ...patch }));
  const blank = (v: string) => v.trim() || undefined;

  const submit = () => {
    const parsed = AdminOrderCreateSchema.safeParse({
      clientId,
      reference: blank(reference),
      recipient: {
        contactName: recipient.contactName,
        phone: recipient.phone,
        ...(deliveryMode === 'door' && {
          zoneId: blank(recipient.zoneId),
          area: blank(recipient.area),
          address: blank(recipient.address),
          landmark: blank(recipient.landmark),
        }),
      },
      deliveryMode,
      destinationOfficeId: deliveryMode === 'collection' ? blank(destinationOfficeId) : undefined,
      serviceLevel,
      paymentMethod,
      notes: blank(notes),
      lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: l.qty })),
    });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[i.path.join('.')] ??= i.message;
      setErrors(map);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (o) => {
        toast.success(
          o.status === 'awaiting_stock'
            ? `${o.number} is waiting for stock`
            : `${o.number} is ready to pick`,
        );
        navigate(`/warehouse/orders/${o.id}`);
      },
    });
  };

  return (
    <>
      <Link
        to={`/warehouse/orders${clientId ? `?client=${clientId}` : ''}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Warehouse orders
      </Link>
      <PageHeader
        title="New warehouse order"
        description="Stock is reserved as soon as the order is saved."
      />
      <form
        noValidate
        className="grid gap-6 lg:grid-cols-[1fr_340px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Items</h2>
            <Field label="Client" error={errors.clientId}>
              <ClientPicker
                className="w-full"
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  setLines([{ productId: '', qty: 1 }]);
                }}
              />
            </Field>
            {clientId && (
              <>
                <LinesEditor
                  products={products.data ?? []}
                  lines={lines}
                  onChange={setLines}
                  available={available}
                />
                {errors.lines && <p className="text-destructive text-xs">{errors.lines}</p>}
              </>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Recipient</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={errors['recipient.contactName']}>
                <Input
                  value={recipient.contactName}
                  onChange={(e) => set({ contactName: e.target.value })}
                />
              </Field>
              <Field label="Phone" error={errors['recipient.phone']}>
                <Input
                  type="tel"
                  value={recipient.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              {(['door', 'collection'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={deliveryMode === m ? 'primary' : 'outline'}
                  onClick={() => setDeliveryMode(m)}
                >
                  {m === 'door' ? 'Door delivery' : 'Collect at office'}
                </Button>
              ))}
            </div>
            {deliveryMode === 'door' ? (
              <>
                <Field label="Area" error={errors['recipient.zoneId'] || errors['recipient.area']}>
                  <AreaSelect
                    zones={zones.data ?? []}
                    zoneId={recipient.zoneId}
                    area={recipient.area}
                    onChange={(zoneId, area) => set({ zoneId, area })}
                  />
                </Field>
                <Field label="Street address" error={errors['recipient.address']}>
                  <Input
                    value={recipient.address}
                    onChange={(e) => set({ address: e.target.value })}
                  />
                </Field>
                <Field label="Landmark (optional)">
                  <Input
                    value={recipient.landmark}
                    onChange={(e) => set({ landmark: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field label="Collection office" error={errors.destinationOfficeId}>
                <Select
                  placeholder="Choose an office"
                  options={officeOptions(offices.data)}
                  value={destinationOfficeId}
                  onChange={(e) => setDestinationOfficeId(e.target.value)}
                />
              </Field>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 p-5">
          <h2 className="font-semibold">Delivery</h2>
          <Field label="Service">
            <Select
              options={SERVICE_LEVELS.map((l) => ({
                value: l,
                label: SERVICE_LEVEL_META[l].label,
              }))}
              value={serviceLevel}
              onChange={(e) => setServiceLevel(e.target.value as ServiceLevel)}
            />
          </Field>
          <Field label="Delivery fee" hint="Item value is never collected — only our delivery fee.">
            <Select
              options={[
                { value: 'on_account', label: 'Bill the client (on account)' },
                { value: 'cash_on_delivery', label: 'Recipient pays the rider' },
              ]}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            />
          </Field>
          <Field
            label="Client’s order reference (optional)"
            hint="Saving the same reference twice won’t duplicate the order."
          >
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={64}
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
          <Button type="submit" className="w-full" loading={create.isPending} disabled={!clientId}>
            Create order
          </Button>
        </Card>
      </form>
    </>
  );
}
