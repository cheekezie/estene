import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, radius } from '@estene/theme/tokens';
import { PARCEL_SIZES, PARCEL_SIZE_META, type ParcelSize } from '@estene/contracts/enums';
import {
  ConfirmDeliverySchema,
  ConfirmPickupSchema,
  type ShipmentDto,
} from '@estene/contracts/shipment';
import { OfficeCard, StatusPill, StopCard, jobFee, parcelLine } from '../../../components/job';
import { TagScanner } from '../../../components/TagScanner';
import {
  Button,
  Card,
  Chips,
  Field,
  Label,
  Loading,
  Notice,
  Row,
  Screen,
  T,
  space,
} from '../../../components/ui';
import { advance, useJob, useJobAction } from '../../../hooks/queries';
import { ApiError, api, errorMessage } from '../../../lib/api';
import { formatNaira } from '../../../lib/format';
import { currentPoint } from '../../../lib/location';
import { uploadPhoto } from '../../../lib/upload';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading, error, refetch } = useJob(id);
  const [finished, setFinished] = useState<string | null>(null);

  if (finished)
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <T size={44}>✓</T>
          <T size={24} weight="800">
            {finished}
          </T>
          <T tone="muted" style={{ textAlign: 'center' }}>
            Nice work. It’s in your earnings now.
          </T>
        </Card>
        <Button title="Back to jobs" onPress={() => router.back()} />
      </Screen>
    );

  if (isLoading) return <Loading />;
  if (error)
    return (
      <Screen>
        <Notice
          tone="error"
          action={<Button title="Try again" variant="outline" onPress={() => void refetch()} />}
        >
          {errorMessage(error)}
        </Notice>
      </Screen>
    );
  if (!job)
    return (
      <Screen>
        <Notice tone="info">
          This job is no longer on your list — it may be finished, reassigned or cancelled.
        </Notice>
        <Button title="Back to jobs" onPress={() => router.back()} />
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: job.trackingNumber }} />
      <Summary job={job} />
      <Step job={job} onFinished={setFinished} />
    </Screen>
  );
}

function Summary({ job }: { job: ShipmentDto }) {
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={18} weight="800">
          {job.trackingNumber}
        </T>
        <StatusPill status={job.status} />
      </Row>
      <T tone="muted">{parcelLine(job)}</T>
      {job.parcel.description ? <T>{job.parcel.description}</T> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={18} weight="700" tone="primary">
          {formatNaira(jobFee(job))}
        </T>
        <T size={14} tone="muted">
          {job.balanceDue > 0 ? `${formatNaira(job.balanceDue)} still to pay` : 'Paid'}
        </T>
      </Row>
    </Card>
  );
}

/** The one thing the rider should do next, by status. */
function Step({ job, onFinished }: { job: ShipmentDto; onFinished: (msg: string) => void }) {
  const f = job.fulfilment;
  switch (job.status) {
    case 'assigned':
      return f.currentOffice ? <CollectFromOffice job={job} /> : <StartPickup job={job} />;
    case 'en_route_to_pickup':
      return (
        <>
          <StopCard title="Pick up from" stop={job.pickup} />
          <PickupForm job={job} />
        </>
      );
    case 'picked_up':
    case 'in_transit': {
      const handInAt =
        f.originOffice ?? (f.deliveryMode === 'collection' ? f.destinationOffice : null);
      if (handInAt)
        return (
          <>
            <OfficeCard title="Hand this parcel in at" office={handInAt} />
            <Notice tone="info">
              Take the parcel to the counter. Staff scan it in and the job closes on its own.
            </Notice>
          </>
        );
      return <StartDelivery job={job} />;
    }
    case 'out_for_delivery':
      return (
        <>
          <StopCard title="Deliver to" stop={job.dropoff} />
          <DeliverForm job={job} onDelivered={() => onFinished('Delivered')} />
          <FailForm job={job} />
        </>
      );
    case 'delivery_failed':
      return <AfterFailure job={job} onReturned={() => onFinished('Marked as returned')} />;
    default:
      return <Notice tone="info">Nothing to do on this job right now.</Notice>;
  }
}

function ActionError({ error }: { error: unknown }) {
  return error ? <Notice tone="error">{errorMessage(error)}</Notice> : null;
}

function StartPickup({ job }: { job: ShipmentDto }) {
  const start = useJobAction(() => api.post(`/api/rider/jobs/${job.id}/start-pickup`));
  return (
    <>
      <StopCard title="Pick up from" stop={job.pickup} />
      <StopCard title="Then deliver to" stop={job.dropoff} />
      <ActionError error={start.error} />
      <Button
        title="Start trip to pickup"
        onPress={() => start.mutate(undefined)}
        loading={start.isPending}
      />
    </>
  );
}

function CollectFromOffice({ job }: { job: ShipmentDto }) {
  const [scanning, setScanning] = useState(false);
  const collect = useJobAction((tagCode: string) =>
    api.post(`/api/rider/jobs/${job.id}/collect-from-office`, { tagCode }),
  );
  return (
    <>
      <OfficeCard title="Collect the parcel at" office={job.fulfilment.currentOffice!} />
      <StopCard title="Then deliver to" stop={job.dropoff} />
      <ActionError error={collect.error} />
      <Button
        title="Scan parcel at the counter"
        onPress={() => setScanning(true)}
        loading={collect.isPending}
      />
      <TagScanner
        visible={scanning}
        title="Scan the parcel’s tag"
        onClose={() => setScanning(false)}
        onScanned={(code) => {
          setScanning(false);
          collect.mutate(code);
        }}
      />
    </>
  );
}

function TagRow({ tag, onScan, label }: { tag: string; onScan: () => void; label: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Label>{label}</Label>
      {tag ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={20} weight="800" style={{ letterSpacing: 1 }}>
            {tag}
          </T>
          <Button title="Rescan" variant="ghost" onPress={onScan} />
        </Row>
      ) : (
        <Button title="Scan QR tag" variant="accent" onPress={onScan} />
      )}
    </View>
  );
}

function PickupForm({ job }: { job: ShipmentDto }) {
  const [scanning, setScanning] = useState(false);
  const [tagCode, setTagCode] = useState('');
  const [size, setSize] = useState<ParcelSize>(job.parcel.size);
  const [weight, setWeight] = useState(String(job.parcel.weightKg));
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const weightKg = Number(weight.replace(',', '.'));
  const changed = size !== job.parcel.size || weightKg !== job.parcel.weightKg;

  const confirm = useJobAction(async () => {
    const parsed = ConfirmPickupSchema.safeParse({
      tagCode,
      size,
      weightKg,
      description: description.trim() || undefined,
      adjustmentReason: changed ? reason.trim() : undefined,
      location: await currentPoint(),
    });
    if (!parsed.success)
      throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the details', 400);
    return api.post<ShipmentDto>(`/api/rider/jobs/${job.id}/pickup`, parsed.data);
  });

  const submit = () => {
    setFormError(null);
    if (!tagCode) return setFormError('Scan the QR tag you’re sticking on the parcel.');
    if (!(weightKg > 0)) return setFormError('Enter the weight in kg.');
    if (changed && reason.trim().length < 5)
      return setFormError('Say why the size or weight is different from the booking.');
    confirm.mutate(undefined);
  };

  return (
    <Card>
      <T size={18} weight="800">
        At pickup
      </T>
      <T tone="muted">
        Stick a new Estene tag on the parcel, scan it, and check the size and weight.
      </T>
      <TagRow tag={tagCode} onScan={() => setScanning(true)} label="Parcel tag" />
      <Label>Size</Label>
      <Chips
        options={PARCEL_SIZES.map((v) => ({ value: v, label: PARCEL_SIZE_META[v].label }))}
        value={size}
        onChange={setSize}
      />
      <T size={13} tone="muted">
        {PARCEL_SIZE_META[size].hint}
      </T>
      <Field
        label="Weight (kg)"
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
      />
      <Field
        label="What’s inside (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder={job.parcel.description || 'e.g. Shoes in a box'}
      />
      {changed ? (
        <>
          <Notice tone="warning">
            Booked as {PARCEL_SIZE_META[job.parcel.size].label}, {job.parcel.weightKg} kg. The price
            will be recalculated and the sender told by SMS.
          </Notice>
          <Field
            label="Why is it different?"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Two boxes, not one"
          />
        </>
      ) : null}
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <ActionError error={confirm.error} />
      <Button title="Confirm pickup" onPress={submit} loading={confirm.isPending} />
      <TagScanner
        visible={scanning}
        title="Scan the new tag"
        onClose={() => setScanning(false)}
        onScanned={(code) => {
          setTagCode(code);
          setScanning(false);
        }}
      />
    </Card>
  );
}

function StartDelivery({ job }: { job: ShipmentDto }) {
  const go = useJobAction(() => advance(job.id, 'out_for_delivery'));
  return (
    <>
      <StopCard title="Deliver to" stop={job.dropoff} />
      <ActionError error={go.error} />
      <Button title="Start delivery" onPress={() => go.mutate(undefined)} loading={go.isPending} />
      <T size={13} tone="muted">
        The recipient gets their delivery PIN by SMS when you start.
      </T>
    </>
  );
}

function DeliverForm({ job, onDelivered }: { job: ShipmentDto; onDelivered: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [tagCode, setTagCode] = useState('');
  const [method, setMethod] = useState<'pin' | 'photo'>('pin');
  const [pin, setPin] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pinLocked, setPinLocked] = useState(false);

  const collectCash = useJobAction(() => api.post(`/api/rider/jobs/${job.id}/collect-balance`));

  const deliver = useJobAction(async () => {
    const photoUrl =
      method === 'photo' && photo ? await uploadPhoto(photo, 'delivery_proof') : undefined;
    const parsed = ConfirmDeliverySchema.safeParse({
      tagCode,
      method,
      pin: method === 'pin' ? pin : undefined,
      photoUrl,
      receivedBy: receivedBy.trim() || undefined,
      location: await currentPoint(),
    });
    if (!parsed.success)
      throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the details', 400);
    return api.post(`/api/rider/jobs/${job.id}/deliver`, parsed.data);
  });

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setFormError('Allow the camera to take a delivery photo.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const submit = () => {
    setFormError(null);
    if (!tagCode) return setFormError('Scan the parcel’s tag first.');
    if (method === 'pin' && !/^\d{4}$/.test(pin))
      return setFormError('Enter the recipient’s 4-digit PIN.');
    if (method === 'photo' && !photo)
      return setFormError('Take a photo of the parcel with the recipient.');
    deliver.mutate(undefined, {
      onSuccess: onDelivered,
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'PIN_LOCKED') {
          setPinLocked(true);
          setMethod('photo');
        }
        if (err instanceof ApiError && err.code === 'TAG_MISMATCH') setTagCode('');
        if (err instanceof ApiError && err.code === 'WRONG_PIN') setPin('');
      },
    });
  };

  if (job.balanceDue > 0)
    return (
      <Card>
        <T size={18} weight="800">
          Collect payment first
        </T>
        <Notice tone="warning">
          Collect {formatNaira(job.balanceDue)} in cash from the customer before handing over the
          parcel.
        </Notice>
        <ActionError error={collectCash.error} />
        <Button
          title={`I’ve collected ${formatNaira(job.balanceDue)}`}
          variant="accent"
          onPress={() => collectCash.mutate(undefined)}
          loading={collectCash.isPending}
        />
      </Card>
    );

  return (
    <Card>
      <T size={18} weight="800">
        Hand over
      </T>
      <TagRow tag={tagCode} onScan={() => setScanning(true)} label="Scan the parcel’s tag" />
      <Label>Proof of delivery</Label>
      <Chips
        options={[
          ...(pinLocked ? [] : [{ value: 'pin' as const, label: 'Recipient’s PIN' }]),
          { value: 'photo' as const, label: 'Photo' },
        ]}
        value={method}
        onChange={setMethod}
      />
      {method === 'pin' ? (
        <Field
          label="4-digit PIN"
          hint="The recipient got it by SMS."
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          style={s.pin}
        />
      ) : (
        <View style={{ gap: space.sm }}>
          {pinLocked ? (
            <Notice tone="warning">
              Too many wrong PINs — take a photo of the recipient with the parcel instead.
            </Notice>
          ) : null}
          {photo ? <Image source={{ uri: photo }} style={s.photo} /> : null}
          <Button
            title={photo ? 'Retake photo' : 'Take photo'}
            variant="outline"
            onPress={() => void takePhoto()}
          />
        </View>
      )}
      <Field
        label="Received by (optional)"
        value={receivedBy}
        onChangeText={setReceivedBy}
        placeholder={job.dropoff.contactName}
      />
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <ActionError error={deliver.error} />
      <Button title="Confirm delivery" onPress={submit} loading={deliver.isPending} />
      <TagScanner
        visible={scanning}
        title="Scan the parcel’s tag"
        onClose={() => setScanning(false)}
        onScanned={(code) => {
          setTagCode(code);
          setScanning(false);
        }}
      />
    </Card>
  );
}

const FAIL_REASONS = [
  { value: 'unreachable', label: 'Can’t reach recipient' },
  { value: 'address', label: 'Address not found' },
  { value: 'refused', label: 'Refused the parcel' },
  { value: 'other', label: 'Other' },
] as const;
type FailReason = (typeof FAIL_REASONS)[number]['value'];

function FailForm({ job }: { job: ShipmentDto }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FailReason | null>(null);
  const [note, setNote] = useState('');
  const fail = useJobAction((text: string) => advance(job.id, 'delivery_failed', text));

  if (!open)
    return <Button title="Couldn’t deliver" variant="danger" onPress={() => setOpen(true)} />;

  const label = FAIL_REASONS.find((r) => r.value === reason)?.label;
  const ready = !!reason && (reason !== 'other' || note.trim().length >= 3);
  return (
    <Card>
      <T size={18} weight="800">
        Couldn’t deliver
      </T>
      <Chips options={[...FAIL_REASONS]} value={reason} onChange={setReason} />
      <Field
        label={reason === 'other' ? 'What happened?' : 'Details (optional)'}
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Called 3 times, no answer"
      />
      <ActionError error={fail.error} />
      <Row>
        <Button
          title="Cancel"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => setOpen(false)}
        />
        <Button
          title="Report"
          variant="danger"
          style={{ flex: 1 }}
          disabled={!ready}
          loading={fail.isPending}
          onPress={() => fail.mutate([label, note.trim()].filter(Boolean).join(': ').slice(0, 300))}
        />
      </Row>
    </Card>
  );
}

function AfterFailure({ job, onReturned }: { job: ShipmentDto; onReturned: () => void }) {
  const retry = useJobAction(() => advance(job.id, 'out_for_delivery', 'Re-attempt'));
  const ret = useJobAction(() => advance(job.id, 'returned', 'Returned to sender'));
  return (
    <>
      <StopCard title="Recipient" stop={job.dropoff} />
      <StopCard title="Sender (for returns)" stop={job.pickup} />
      <Notice tone="warning">
        Delivery failed. Try again, or take the parcel back to the sender.
      </Notice>
      <ActionError error={retry.error ?? ret.error} />
      <Button
        title="Try delivery again"
        onPress={() => retry.mutate(undefined)}
        loading={retry.isPending}
      />
      <Button
        title="Returned to sender"
        variant="outline"
        onPress={() => ret.mutate(undefined, { onSuccess: onReturned })}
        loading={ret.isPending}
      />
    </>
  );
}

const s = StyleSheet.create({
  pin: { fontSize: 28, letterSpacing: 12, textAlign: 'center', fontWeight: '700' },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
  },
});
