import { useState } from 'react';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Textarea } from '@estene/ui/textarea';

/** Confirms a destructive action and captures an optional reason for the audit trail. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: (reason: string | undefined) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <Field label="Reason" hint="Saved on the shipment timeline.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep shipment
          </Button>
          <Button
            variant="destructive"
            loading={loading}
            onClick={() => onConfirm(reason.trim() || undefined)}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
