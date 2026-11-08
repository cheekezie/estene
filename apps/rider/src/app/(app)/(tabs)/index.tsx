import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '@estene/theme/tokens';
import type { ShipmentDto } from '@estene/contracts/shipment';
import { JobCard, OfferCard } from '../../../components/job';
import { Button, Card, Label, Notice, Row, Screen, T, space } from '../../../components/ui';
import { useAuth } from '../../../hooks/auth';
import { useOnline } from '../../../hooks/online';
import { keys, useJobs, useOffers } from '../../../hooks/queries';
import { api, errorMessage } from '../../../lib/api';
import { openSettings } from '../../../lib/location';

export default function HomeScreen() {
  const { user } = useAuth();
  const { online, busy, problem, setOnline, dismissProblem } = useOnline();
  const offers = useOffers(online);
  const jobs = useJobs();
  const qc = useQueryClient();
  const [acting, setActing] = useState<{ id: string; kind: 'accept' | 'decline' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Buzz when a new offer appears.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const fresh = (offers.data ?? []).filter((o) => !seen.current.has(o.offerId));
    fresh.forEach((o) => seen.current.add(o.offerId));
    if (fresh.length) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [offers.data]);

  const respond = async (offerId: string, accept: boolean) => {
    setActing({ id: offerId, kind: accept ? 'accept' : 'decline' });
    setActionError(null);
    try {
      if (accept) {
        const job = await api.post<ShipmentDto>(`/api/rider/offers/${offerId}/accept`);
        await qc.invalidateQueries({ queryKey: keys.jobs });
        router.push({ pathname: '/job/[id]', params: { id: job.id } });
      } else {
        await api.post(`/api/rider/offers/${offerId}/decline`);
      }
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActing(null);
      void qc.invalidateQueries({ queryKey: keys.offers });
    }
  };

  const liveOffers = (offers.data ?? []).filter(
    (o) => new Date(o.expiresAt).getTime() > Date.now(),
  );

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={jobs.isRefetching}
          onRefresh={() => {
            void jobs.refetch();
            if (online) void offers.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <Card style={[s.switchCard, online && s.switchCardOn]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T
              size={22}
              weight="800"
              style={online ? { color: colors.primaryForeground } : undefined}
            >
              {online ? 'You’re online' : 'You’re offline'}
            </T>
            <T size={14} style={{ color: online ? colors.primarySoft : colors.mutedForeground }}>
              {online
                ? 'Nearby jobs will come to you.'
                : `Go online to get jobs, ${user?.name.split(' ')[0] ?? ''}.`}
            </T>
          </View>
          <Switch
            value={online}
            disabled={busy}
            onValueChange={(v) => void setOnline(v)}
            trackColor={{ false: colors.input, true: colors.accent }}
            thumbColor={colors.card}
            accessibilityLabel={online ? 'Go offline' : 'Go online'}
            style={{ transform: [{ scale: 1.25 }] }}
          />
        </Row>
      </Card>

      {problem ? (
        <Notice
          tone="warning"
          action={
            <Row>
              {problem.canOpenSettings ? (
                <Button
                  title="Open settings"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => void openSettings()}
                />
              ) : null}
              <Button title="OK" variant="ghost" style={{ flex: 1 }} onPress={dismissProblem} />
            </Row>
          }
        >
          {problem.message}
        </Notice>
      ) : null}

      {actionError ? <Notice tone="error">{actionError}</Notice> : null}

      {online && liveOffers.length > 0 ? (
        <View style={{ gap: space.md }}>
          <Label>Job offers</Label>
          {liveOffers.map((o) => (
            <OfferCard
              key={o.offerId}
              offer={o}
              accepting={acting?.id === o.offerId && acting.kind === 'accept'}
              declining={acting?.id === o.offerId && acting.kind === 'decline'}
              onAccept={() => void respond(o.offerId, true)}
              onDecline={() => void respond(o.offerId, false)}
            />
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <Label>My jobs</Label>
        {jobs.error ? (
          <Notice
            tone="error"
            action={
              <Button title="Try again" variant="outline" onPress={() => void jobs.refetch()} />
            }
          >
            {errorMessage(jobs.error)}
          </Notice>
        ) : jobs.data?.length ? (
          jobs.data.map((j) => <JobCard key={j.id} job={j} />)
        ) : jobs.isLoading ? null : (
          <Card>
            <T tone="muted">
              {online
                ? 'No jobs right now. Offers appear here — keep the app open or watch for notifications.'
                : 'No active jobs.'}
            </T>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  switchCard: { paddingVertical: space.xl },
  switchCardOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
