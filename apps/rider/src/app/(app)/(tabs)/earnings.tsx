import { RefreshControl, View } from 'react-native';
import { colors } from '@estene/theme/tokens';
import type { PayoutStatus } from '@estene/contracts/payout';
import { StatusPill } from '../../../components/job';
import {
  Button,
  Card,
  Divider,
  Label,
  Loading,
  Notice,
  Row,
  Screen,
  T,
  space,
} from '../../../components/ui';
import { useEarnings, useHistory, usePayouts } from '../../../hooks/queries';
import { errorMessage } from '../../../lib/api';
import { formatDate, formatNaira } from '../../../lib/format';

const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  pending: 'Queued',
  processing: 'On its way',
  success: 'Paid',
  failed: 'Failed',
};

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T tone="muted">{label}</T>
      <T weight={strong ? '800' : '600'}>{value}</T>
    </Row>
  );
}

export default function EarningsScreen() {
  const earnings = useEarnings();
  const payouts = usePayouts();
  const history = useHistory();
  const e = earnings.data;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={earnings.isRefetching}
          onRefresh={() => {
            void earnings.refetch();
            void payouts.refetch();
            void history.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {earnings.error ? (
        <Notice
          tone="error"
          action={
            <Button title="Try again" variant="outline" onPress={() => void earnings.refetch()} />
          }
        >
          {errorMessage(earnings.error)}
        </Notice>
      ) : !e ? (
        <Loading />
      ) : (
        <>
          <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
            <T size={14} style={{ color: colors.primarySoft }}>
              Available to pay out
            </T>
            <T size={34} weight="800" style={{ color: colors.primaryForeground }}>
              {formatNaira(e.available)}
            </T>
            <T size={14} style={{ color: colors.primarySoft }}>
              {e.deliveredTrips} delivered trip{e.deliveredTrips === 1 ? '' : 's'}
            </T>
          </Card>
          <Card>
            {e.type === 'partner' ? (
              <>
                <Line label="Fares" value={formatNaira(e.grossFares)} />
                <Line label="Estene commission" value={`− ${formatNaira(e.commission)}`} />
              </>
            ) : null}
            <Line label="Earnings" value={formatNaira(e.earnings)} strong />
            <Divider />
            <Line label="Paid out" value={formatNaira(e.paidOut)} />
            <Line label="Payouts in progress" value={formatNaira(e.pendingPayouts)} />
            <Line label="Cash you’re holding" value={formatNaira(e.cashHeld)} />
            {e.cashHeld > 0 ? (
              <T size={13} tone="muted">
                Hand customer cash in at an Estene office — it’s taken off what we pay you.
              </T>
            ) : null}
          </Card>
          <Card>
            <Label>Bank account</Label>
            {e.bankAccount ? (
              <T>
                {e.bankAccount.bankName} · {e.bankAccount.accountNumber}
                {'\n'}
                {e.bankAccount.accountName}
              </T>
            ) : (
              <T tone="muted">
                No bank account yet. Ask operations to add yours so we can pay you.
              </T>
            )}
          </Card>
        </>
      )}

      <View style={{ gap: space.md }}>
        <Label>Payouts</Label>
        {payouts.data?.items.length ? (
          <Card>
            {payouts.data.items.map((p, i) => (
              <View key={p.id} style={{ gap: 2 }}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between', paddingTop: i > 0 ? space.sm : 0 }}>
                  <T weight="700">{formatNaira(p.amount)}</T>
                  <T
                    size={14}
                    tone={
                      p.status === 'failed'
                        ? 'danger'
                        : p.status === 'success'
                          ? 'success'
                          : 'muted'
                    }
                  >
                    {PAYOUT_LABEL[p.status]}
                  </T>
                </Row>
                <T size={13} tone="muted">
                  {formatDate(p.completedAt ?? p.createdAt)}
                  {p.failureReason ? ` · ${p.failureReason}` : ''}
                </T>
              </View>
            ))}
          </Card>
        ) : (
          <T tone="muted">{payouts.isLoading ? '' : 'No payouts yet.'}</T>
        )}
      </View>

      <View style={{ gap: space.md }}>
        <Label>Recent jobs</Label>
        {history.data?.items.length ? (
          <Card>
            {history.data.items.map((j, i) => (
              <View key={j.id} style={{ gap: 2 }}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ justifyContent: 'space-between', paddingTop: i > 0 ? space.sm : 0 }}>
                  <T weight="700">{j.trackingNumber}</T>
                  <StatusPill status={j.status} />
                </Row>
                <T size={13} tone="muted">
                  {(j.pickup.area ?? j.pickup.zone?.name) +
                    ' → ' +
                    (j.dropoff.area ?? j.dropoff.zone?.name)}{' '}
                  · {formatDate(j.createdAt)}
                </T>
              </View>
            ))}
          </Card>
        ) : (
          <T tone="muted">{history.isLoading ? '' : 'Finished jobs will show here.'}</T>
        )}
      </View>
    </Screen>
  );
}
