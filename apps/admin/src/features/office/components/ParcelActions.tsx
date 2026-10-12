import { useState } from 'react';
import {
  ArrowRightLeft,
  Bike,
  CheckCircle2,
  KeyRound,
  PackageCheck,
  PackagePlus,
  Truck,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PARCEL_SIZES, PARCEL_SIZE_META, type ParcelSize } from '@estene/contracts/enums';
import { formatNaira } from '@estene/contracts/money';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { ApiError } from '@estene/lib/errors';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { Field } from '@estene/ui/Field';
import { Input } from '@estene/ui/input';
import { Select } from '@estene/ui/select';
import { Textarea } from '@estene/ui/textarea';
import { api } from '@/lib/api';
import { CreateManifestDialog } from '../../manifests/CreateManifestDialog';
import { useLoadParcel } from '../../manifests/manifests.queries';
import { useOfficeActions, type OfficeAction, type OfficeQueue } from '../office.queries';

const LABEL: Record<OfficeAction, { label: string; icon: typeof Truck }> = {
  receive_dropoff: { label: 'Check in drop-off', icon: PackagePlus },
  receive_from_rider: { label: 'Receive from rider', icon: Bike },
  receive_from_manifest: { label: 'Check in from manifest', icon: PackageCheck },
  add_to_manifest: { label: 'Add to manifest', icon: ArrowRightLeft },
  mark_ready_for_collection: { label: 'Ready for collection', icon: CheckCircle2 },
  hand_to_recipient: { label: 'Hand to recipient', icon: KeyRound },
  dispatch_for_delivery: { label: 'Send out for delivery', icon: Truck },
};

/**
 * The buttons for whatever this parcel needs next at this office. Used by the
 * scan result and by every queue row, so scanning and tapping behave the same.
 * `scannedCode` is what the agent just scanned — rider and manifest hand-ins
 * need the physical QR tag, not just a typed tracking number.
 */
export function ParcelActions({
  officeId,
  shipment,
  actions,
  scannedCode,
  queue,
  size = 'md',
}: {
  officeId: string;
  shipment: ShipmentDto;
  actions: OfficeAction[];
  scannedCode?: string;
  queue?: OfficeQueue;
  size?: 'sm' | 'md';
}) {
  const a = useOfficeActions(officeId);
  const [open, setOpen] = useState<OfficeAction | null>(null);
  const done = (msg: string) => () => toast.success(msg);
  const tagScanned = !!scannedCode && scannedCode === shipment.tagCode;

  const run = (action: OfficeAction) => {
    switch (action) {
      case 'mark_ready_for_collection':
        return a.readyForCollection.mutate(shipment.id, {
          onSuccess: done('Recipient notified with the office address and PIN'),
        });
      case 'dispatch_for_delivery':
        return a.dispatch.mutate(shipment.id, {
          onSuccess: done('Finding a rider near this office'),
        });
      case 'receive_from_manifest':
        return a.receiveFromManifest.mutate(scannedCode ?? shipment.trackingNumber, {
          onSuccess: done('Checked in'),
        });
      case 'receive_from_rider':
        if (tagScanned)
          return a.receiveFromRider.mutate(scannedCode, {
            onSuccess: done('Handed in — rider is free for the next job'),
          });
        return setOpen(action); // ask for the tag
      default:
        return setOpen(action);
    }
  };

  const pending = Object.values(a).some((m) => m.isPending);
  if (!actions.length) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const { label, icon: Icon } = LABEL[action];
          return (
            <Button
              key={action}
              size={size}
              variant={size === 'sm' ? 'outline' : 'primary'}
              disabled={pending}
              onClick={() => run(action)}
            >
              <Icon />
              {label}
            </Button>
          );
        })}
      </div>

      {open === 'receive_dropoff' && (
        <ReceiveDropoffDialog
          officeId={officeId}
          shipment={shipment}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'hand_to_recipient' && (
        <HandOverDialog officeId={officeId} shipment={shipment} onClose={() => setOpen(null)} />
      )}
      {open === 'add_to_manifest' && (
        <AddToManifestDialog
          officeId={officeId}
          shipment={shipment}
          queue={queue}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'receive_from_rider' && (
        <TagPrompt
          title="Scan the parcel’s QR tag"
          description="Confirms the rider has physically handed this parcel in."
          busy={a.receiveFromRider.isPending}
          onSubmit={(code) =>
            a.receiveFromRider.mutate(code, {
              onSuccess: () => {
                toast.success('Handed in');
                setOpen(null);
              },
            })
          }
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Sender at the counter: put a fresh QR tag on it and confirm what it actually is — same as a rider pickup. */
function ReceiveDropoffDialog({
  officeId,
  shipment,
  onClose,
}: {
  officeId: string;
  shipment: ShipmentDto;
  onClose: () => void;
}) {
  const { receiveDropoff } = useOfficeActions(officeId);
  const [tagCode, setTagCode] = useState('');
  const [size, setSize] = useState<ParcelSize>(shipment.parcel.size);
  const [weight, setWeight] = useState(String(shipment.parcel.weightKg));
  const [reason, setReason] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const cashDue = shipment.paymentMethod === 'cash_on_pickup' && shipment.balanceDue > 0;

  const submit = () =>
    receiveDropoff.mutate(
      {
        shipmentId: shipment.id,
        input: {
          tagCode: tagCode.trim().toUpperCase(),
          size,
          weightKg: Number(weight),
          adjustmentReason: reason.trim() || undefined,
        },
      },
      {
        onSuccess: (s) => {
          toast.success(
            `${s.trackingNumber} checked in${s.adjustment ? ` · re-priced to ${formatNaira(s.adjustment.to)}` : ''}`,
          );
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'ADJUSTMENT_REASON_REQUIRED') setNeedReason(true);
          else toast.error(e.message);
        },
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Check in ${shipment.trackingNumber}`}
        description={`${shipment.pickup.contactName} is dropping off: ${shipment.parcel.description}`}
      >
        <div className="space-y-4">
          <Field label="QR tag" hint="Stick a fresh tag on the parcel and scan it.">
            <Input
              autoFocus
              className="font-mono uppercase"
              value={tagCode}
              onChange={(e) => setTagCode(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Size">
              <Select
                options={PARCEL_SIZES.map((s) => ({ value: s, label: PARCEL_SIZE_META[s].label }))}
                value={size}
                onChange={(e) => setSize(e.target.value as ParcelSize)}
              />
            </Field>
            <Field label="Weight (kg)">
              <Input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </div>
          {needReason && (
            <Field
              label="Why is it different from the booking?"
              hint="The price changes and the sender gets an SMS."
            >
              <Textarea
                rows={2}
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          {cashDue && (
            <p className="bg-accent-soft rounded-md p-3 text-sm">
              Collect <strong>{formatNaira(shipment.balanceDue)}</strong> cash from the sender —
              it’s recorded when you check in.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={
                tagCode.trim().length < 6 ||
                !(Number(weight) > 0) ||
                (needReason && reason.trim().length < 5)
              }
              loading={receiveDropoff.isPending}
              onClick={submit}
            >
              Check in
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Recipient at the counter: they read out the PIN from their SMS. */
function HandOverDialog({
  officeId,
  shipment,
  onClose,
}: {
  officeId: string;
  shipment: ShipmentDto;
  onClose: () => void;
}) {
  const { handOver } = useOfficeActions(officeId);
  const [pin, setPin] = useState('');
  const [receivedBy, setReceivedBy] = useState(shipment.dropoff.contactName);
  const cashDue = shipment.balanceDue > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Hand over ${shipment.trackingNumber}`}
        description={`For ${shipment.dropoff.contactName}. Ask for the 4-digit PIN from their SMS.`}
      >
        <div className="space-y-4">
          <Field label="Recipient’s PIN">
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              className="w-32 text-center font-mono text-2xl tracking-[0.4em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="Collected by" hint="Name of the person taking it, if not the recipient.">
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </Field>
          {cashDue && (
            <p className="bg-accent-soft rounded-md p-3 text-sm">
              Collect <strong>{formatNaira(shipment.balanceDue)}</strong> before handing over — it’s
              recorded with this collection.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={pin.length !== 4}
              loading={handOver.isPending}
              onClick={() =>
                handOver.mutate(
                  { shipmentId: shipment.id, pin, receivedBy: receivedBy.trim() || undefined },
                  {
                    onSuccess: () => {
                      toast.success('Collected');
                      onClose();
                    },
                  },
                )
              }
            >
              Confirm hand-over
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Put a parcel on an open manifest heading to its destination office — or open one. */
function AddToManifestDialog({
  officeId,
  shipment,
  queue,
  onClose,
}: {
  officeId: string;
  shipment: ShipmentDto;
  queue?: OfficeQueue;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const destination = shipment.fulfilment.destinationOffice;
  const candidates = (queue?.openManifests ?? []).filter((m) => m.to.id === destination?.id);
  const [creating, setCreating] = useState(false);

  if (creating) {
    // Open the manifest and load this parcel onto it in one go.
    return (
      <CreateManifestDialog
        fromOfficeId={officeId}
        toOfficeId={destination?.id}
        onClose={onClose}
        onCreated={(m) =>
          api
            .post(`/manifests/${m.id}/shipments`, { code: shipment.trackingNumber })
            .then(() => {
              toast.success(`${shipment.trackingNumber} loaded onto ${m.code}`);
              void qc.invalidateQueries({ queryKey: ['office'] });
              void qc.invalidateQueries({ queryKey: ['manifests'] });
            })
            .catch((e: Error) => toast.error(e.message))
        }
      />
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Send ${shipment.trackingNumber} to ${destination?.name ?? 'its office'}`}
        description={destination ? `${destination.city} · ${destination.code}` : undefined}
      >
        <div className="space-y-3">
          {candidates.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No open manifest to {destination?.name} yet.
            </p>
          )}
          {candidates.map((m) => (
            <LoadOnto
              key={m.id}
              manifestId={m.id}
              code={m.code}
              count={m.counts.total}
              carrier={m.carrier.carrierName ?? m.carrier.vehiclePlate ?? ''}
              parcel={shipment.trackingNumber}
              onDone={onClose}
            />
          ))}
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            <ArrowRightLeft />
            Open a new manifest to {destination?.name}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadOnto({
  manifestId,
  code,
  count,
  carrier,
  parcel,
  onDone,
}: {
  manifestId: string;
  code: string;
  count: number;
  carrier: string;
  parcel: string;
  onDone: () => void;
}) {
  const load = useLoadParcel(manifestId);
  return (
    <button
      className="hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 text-left"
      disabled={load.isPending}
      onClick={() =>
        load.mutate(parcel, {
          onSuccess: () => {
            toast.success(`Loaded onto ${code}`);
            onDone();
          },
        })
      }
    >
      <span>
        <span className="block font-mono text-sm font-semibold">{code}</span>
        <span className="text-muted-foreground text-xs">
          {carrier || 'Carrier not set'} · {count} parcels
        </span>
      </span>
      <span className="text-primary text-sm font-medium">Load</span>
    </button>
  );
}

function TagPrompt({
  title,
  description,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  busy: boolean;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(code.trim().toUpperCase());
          }}
        >
          <Input
            autoFocus
            className="font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="QR tag code"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={code.trim().length < 6} loading={busy}>
              Confirm
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
