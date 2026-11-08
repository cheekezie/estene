import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { InboundCreateSchema } from '@estene/contracts/warehouse';
import { Button } from '@estene/ui/button';
import { Card } from '@estene/ui/card';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Textarea } from '@estene/ui/textarea';
import { BackLink } from '@/shared/components/BackLink';
import { LinesEditor, type Line } from '@/shared/components/LinesEditor';
import { PageHeader } from '@/shared/components/PageHeader';
import { blank, fieldErrors } from '@/shared/forms';
import { useProductOptions } from '../products/products.queries';
import { useCreateInbound } from './inbound.queries';

export default function NewInboundPage() {
  const navigate = useNavigate();
  const products = useProductOptions();
  const create = useCreateInbound();
  const [lines, setLines] = useState<Line[]>([{ productId: '', qty: 1 }]);
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <>
      <BackLink to="/inbound" label="Inbound" />
      <PageHeader
        title="Book an inbound"
        description="List what you’re sending. Write the inbound number on the boxes."
      />
      <form
        noValidate
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = InboundCreateSchema.safeParse({
            reference: blank(reference),
            expectedAt: expectedAt || undefined,
            notes: blank(notes),
            lines: lines
              .filter((l) => l.productId)
              .map((l) => ({ productId: l.productId, expectedQty: l.qty })),
          });
          if (!parsed.success) return setErrors(fieldErrors(parsed.error));
          setErrors({});
          create.mutate(parsed.data, {
            onSuccess: (i) => {
              toast.success(`Booked as ${i.number} — mark your boxes with it`);
              navigate('/inbound');
            },
          });
        }}
      >
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Products</h2>
          {products.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Add your products first on the{' '}
              <Link to="/products" className="text-primary hover:underline">
                Products
              </Link>{' '}
              page.
            </p>
          ) : (
            <LinesEditor products={products.data ?? []} lines={lines} onChange={setLines} />
          )}
          {errors.lines && <p className="text-destructive text-xs">{errors.lines}</p>}
        </Card>
        <Card className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your reference (optional)" hint="e.g. your purchase order number">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={64}
              />
            </Field>
            <Field label="Arriving on (optional)" error={errors.expectedAt}>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
          <Button type="submit" loading={create.isPending}>
            Book inbound
          </Button>
        </Card>
      </form>
    </>
  );
}
