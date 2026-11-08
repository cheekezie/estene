import { useState } from 'react';
import { toast } from 'sonner';
import type { RiderApplicationDto } from '@estene/contracts/rider-application';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Textarea } from '@estene/ui/textarea';
import { officeOptions, useOffices } from '../../offices/offices.queries';
import { useScheduleVetting } from '../rider-applications.queries';

/** `datetime-local` wants local "YYYY-MM-DDTHH:mm". */
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function VettingDialog({
  application: a,
  open,
  onOpenChange,
}: {
  application: RiderApplicationDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const offices = useOffices();
  const schedule = useScheduleVetting(a.id);
  const [at, setAt] = useState(toLocalInput(a.vetting?.at));
  const [officeId, setOfficeId] = useState(a.vetting?.office?.id ?? '');
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Invite for vetting"
        description="Agree a time with the applicant first. With a time or office set, they get an SMS with the details and what to bring."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            schedule.mutate(
              {
                vettingAt: at ? new Date(at).toISOString() : undefined,
                officeId: officeId || undefined,
                note: note.trim() || undefined,
              },
              {
                onSuccess: () => {
                  toast.success(at || officeId ? 'Vetting booked — SMS sent' : 'Moved to vetting');
                  setNote('');
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <Field label="Date and time">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="Office">
            <Select
              placeholder="Select an office"
              options={officeOptions(offices.data)}
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
            />
          </Field>
          <Field label="Note (optional)">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Called — confirmed, bringing guarantor"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={schedule.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
