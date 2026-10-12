import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ClientInputSchema, type ClientDto } from '@estene/contracts/client';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Textarea } from '@estene/ui/textarea';
import { useCreateClient, useUpdateClient } from '../clients.queries';

type FormIn = z.input<typeof ClientInputSchema>;
type FormOut = z.output<typeof ClientInputSchema>;

export function ClientFormDialog({
  client,
  onClose,
  onCreated,
}: {
  client?: ClientDto;
  onClose: () => void;
  onCreated?: (c: ClientDto) => void;
}) {
  const create = useCreateClient();
  const update = useUpdateClient(client?.id ?? '');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(ClientInputSchema),
    defaultValues: client
      ? {
          name: client.name,
          contactName: client.contactName,
          email: client.email,
          phone: client.phone,
          notes: client.notes,
        }
      : undefined,
  });

  const onSubmit = handleSubmit((input) => {
    if (client)
      update.mutate(input, {
        onSuccess: () => {
          toast.success('Client updated');
          onClose();
        },
      });
    else
      create.mutate(input, {
        onSuccess: (c) => {
          toast.success('Client created');
          onCreated?.(c);
          onClose();
        },
      });
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={client ? `Edit ${client.name}` : 'New business client'}
        description={
          client
            ? undefined
            : 'Businesses can book by phone, be billed on account, and integrate through the API.'
        }
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Business name" error={errors.name?.message}>
            <Input {...register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact person" error={errors.contactName?.message}>
              <Input {...register('contactName')} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input type="tel" {...register('phone')} />
            </Field>
          </div>
          <Field
            label="Email"
            error={errors.email?.message}
            hint="Invoices and integration notices go here."
          >
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              rows={2}
              {...register('notes', { setValueAs: (v: string) => v || undefined })}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {client ? 'Save' : 'Create client'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
