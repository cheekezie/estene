import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius } from '@estene/theme/tokens';
import { PARCEL_SIZE_META } from '@estene/contracts/enums';
import type { ShipmentStatus } from '@estene/contracts/enums';
import type { ShipmentDto, StopDto } from '@estene/contracts/shipment';
import { formatKm, formatNaira, formatPhone } from '../lib/format';
import { call, navigateTo } from '../lib/navigate';
import type { OfferDto } from '../hooks/queries';
import { Button, Card, Label, Row, T, space } from './ui';

/** What the rider is doing at each status, in their words (not the customer's). */
export const RIDER_STATUS: Partial<
  Record<ShipmentStatus, { label: string; tone: 'info' | 'progress' | 'warning' | 'success' }>
> = {
  assigned: { label: 'Accepted', tone: 'info' },
  en_route_to_pickup: { label: 'Going to pickup', tone: 'progress' },
  picked_up: { label: 'Picked up', tone: 'progress' },
  in_transit: { label: 'In transit', tone: 'progress' },
  out_for_delivery: { label: 'Delivering', tone: 'progress' },
  delivery_failed: { label: 'Not delivered', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  returned: { label: 'Returned', tone: 'warning' },
};

export function StatusPill({ status }: { status: ShipmentStatus }) {
  const meta = RIDER_STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'info' as const };
  const c = {
    info: [colors.infoSoft, colors.info],
    progress: [colors.accentSoft, colors.accentForeground],
    warning: [colors.warningSoft, colors.warning],
    success: [colors.successSoft, colors.success],
  }[meta.tone];
  return (
    <View style={[st.pill, { backgroundColor: c[0] }]}>
      <Text style={{ color: c[1], fontWeight: '700', fontSize: 13 }}>{meta.label}</Text>
    </View>
  );
}

/** Text Google Maps can search for when the stop has no coordinates. */
export const stopSearchText = (stop: StopDto) =>
  [stop.address, stop.landmark, stop.area, stop.zone?.name, 'Abuja'].filter(Boolean).join(', ');

/** A pickup or drop-off: who, where, and one-tap Call / Navigate. */
export function StopCard({ title, stop }: { title: string; stop: StopDto }) {
  return (
    <Card>
      <Label>{title}</Label>
      <T size={20} weight="700">
        {stop.address ?? stop.area ?? stop.zone?.name}
      </T>
      {stop.landmark ? (
        <T size={16} tone="muted">
          Landmark: {stop.landmark}
        </T>
      ) : null}
      <T size={15} tone="muted">
        {[stop.area, stop.zone?.name].filter(Boolean).join(' · ')}
      </T>
      <T size={16} weight="600">
        {stop.contactName} · {formatPhone(stop.phone)}
      </T>
      <Row>
        <Button
          title="Call"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => call(stop.phone)}
        />
        <Button
          title="Navigate"
          style={{ flex: 1 }}
          onPress={() => navigateTo({ location: stop.location, text: stopSearchText(stop) })}
        />
      </Row>
      {!stop.location ? (
        <T size={13} tone="muted">
          No pin for this address yet — Google Maps will search for it. Call if you can’t find it.
        </T>
      ) : null}
    </Card>
  );
}

/** An Estene office leg (hand-in or collection). */
export function OfficeCard({
  title,
  office,
}: {
  title: string;
  office: NonNullable<ShipmentDto['fulfilment']['currentOffice']>;
}) {
  return (
    <Card>
      <Label>{title}</Label>
      <T size={20} weight="700">
        {office.name}
      </T>
      <T>{office.address}</T>
      {office.landmark ? <T tone="muted">{office.landmark}</T> : null}
      <T tone="muted">
        {office.code} · {office.city}
      </T>
      <Button
        title="Navigate"
        onPress={() =>
          navigateTo({
            location: office.location,
            text: `${office.address}, ${office.city}`,
          })
        }
      />
    </Card>
  );
}

export const jobFee = (s: ShipmentDto) => s.finalAmount ?? s.estimate.total;

export function parcelLine(s: ShipmentDto) {
  return `${PARCEL_SIZE_META[s.parcel.size].label} · ${s.parcel.weightKg} kg${s.parcel.fragile ? ' · Fragile' : ''}`;
}

function areaOf(stop: StopDto) {
  return stop.area ?? stop.zone?.name ?? '—';
}

function useSecondsLeft(expiresAt: string) {
  const calc = () => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setLeft(calc()), 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return left;
}

export function OfferCard({
  offer,
  onAccept,
  onDecline,
  accepting,
  declining,
}: {
  offer: OfferDto;
  onAccept: () => void;
  onDecline: () => void;
  accepting?: boolean;
  declining?: boolean;
}) {
  const left = useSecondsLeft(offer.expiresAt);
  const s = offer.shipment;
  if (left === 0) return null;
  return (
    <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={13} weight="800" style={{ color: colors.accentForeground, letterSpacing: 0.6 }}>
          NEW JOB
        </T>
        <View style={st.timer}>
          <Text style={st.timerText}>{left}s</Text>
        </View>
      </Row>
      <T size={22} weight="800">
        {areaOf(s.pickup)} → {areaOf(s.dropoff)}
      </T>
      <T tone="muted">
        {formatKm(offer.distanceKm)} to pickup · {parcelLine(s)}
      </T>
      <T size={20} weight="700" tone="primary">
        {formatNaira(jobFee(s))}
      </T>
      <Row>
        <Button
          title="Decline"
          variant="outline"
          style={{ flex: 1 }}
          onPress={onDecline}
          loading={declining}
          disabled={accepting}
        />
        <Button
          title="Accept"
          variant="accent"
          style={{ flex: 2 }}
          onPress={onAccept}
          loading={accepting}
          disabled={declining}
        />
      </Row>
    </Card>
  );
}

export function JobCard({ job }: { job: ShipmentDto }) {
  const toPickup =
    ['assigned', 'en_route_to_pickup'].includes(job.status) && !job.fulfilment.currentOffice;
  const next = toPickup ? job.pickup : job.dropoff;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
      style={({ pressed }) => [st.jobCard, pressed && { opacity: 0.85 }]}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">{job.trackingNumber}</T>
        <StatusPill status={job.status} />
      </Row>
      <T size={18} weight="700">
        {toPickup ? 'Pick up at ' : 'Deliver to '}
        {areaOf(next)}
      </T>
      <T tone="muted" numberOfLines={1}>
        {next.address ?? next.landmark ?? ''}
      </T>
      <T size={14} tone="primary" weight="600">
        Open job →
      </T>
    </Pressable>
  );
}

export function BrandHeader({ title }: { title: string }) {
  return (
    <Row>
      <Image source={require('../../assets/icon.png')} style={st.logo} />
      <T size={20} weight="800">
        {title}
      </T>
    </Row>
  );
}

const st = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 4 },
  timer: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minWidth: 52,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    alignItems: 'center',
  },
  timerText: { color: colors.accentForeground, fontWeight: '800', fontSize: 16 },
  jobCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xs,
  },
  logo: { width: 32, height: 32, borderRadius: 8 },
});
