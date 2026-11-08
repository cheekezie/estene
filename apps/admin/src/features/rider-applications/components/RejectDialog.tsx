import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Textarea } from '@estene/ui/textarea';
import { useRejectApplication } from '../rider-applications.queries';

export function RejectDialog({
  applicationId,
  open,
  onOpenChange,
}: {
  applicationId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const reject = useRejectApplication(applicationId);
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Reject application"
        description="The applicant isn't told automatically — call them. The reason is kept on the application."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate(reason.trim(), {
              onSuccess: () => {
                toast.success('Application rejected');
                onOpenChange(false);
              },
            });
          }}
        >
          <Field label="Reason">
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Licence expired; no guarantor"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={reject.isPending}
              disabled={reason.trim().length < 3}
            >
              Reject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
