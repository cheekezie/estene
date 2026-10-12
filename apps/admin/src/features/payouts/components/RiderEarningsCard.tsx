import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Landmark, ShieldCheck } from 'lucide-react';
import { formatNaira } from '@estene/contracts/money';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { useRiderEarnings } from '../payouts.queries';
import { BankAccountDialog } from './BankAccountDialog';
import { PayoutDialog } from './PayoutDialog';

/** Rider page summary: earnings position, payout account and a quick Pay action. Finance only. */
export function RiderEarningsCard({ riderId, riderName }: { riderId: string; riderName: string }) {
  const q = useRiderEarnings(riderId);
  const [bank, setBank] = useState(false);
  const [paying, setPaying] = useState(false);
  const e = q.data;
  if (!e) return null;
  const partner = e.type === 'partner';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earnings & payouts</CardTitle>
        <Link to="/payouts?tab=history" className="text-primary text-xs hover:underline">
          History
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="space-y-2">
          <Row label="Delivered trips">{e.deliveredTrips}</Row>
          {partner && <Row label="Earned (after commission)">{formatNaira(e.earnings)}</Row>}
          {partner && <Row label="Paid out">{formatNaira(e.paidOut + e.pendingPayouts)}</Row>}
          <Row label="Cash held">{formatNaira(e.cashHeld)}</Row>
          {partner && (
            <Row label="Available to pay" strong>
              {formatNaira(e.available)}
            </Row>
          )}
        </dl>
        {!partner && (
          <p className="text-muted-foreground text-xs">
            Company rider — paid through payroll. Cash held must still be handed in.
          </p>
        )}

        {partner && (
          <div className="rounded-lg border p-3">
            {e.bankAccount ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  <ShieldCheck className="text-success mt-0.5 size-4" />
                  <div>
                    <p className="font-medium">{e.bankAccount.accountName}</p>
                    <p className="text-muted-foreground text-xs">
                      {e.bankAccount.bankName} · {e.bankAccount.accountNumber}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setBank(true)}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground">No payout account yet.</p>
                <Button size="sm" variant="outline" onClick={() => setBank(true)}>
                  <Landmark />
                  Add account
                </Button>
              </div>
            )}
          </div>
        )}
        {partner && e.available > 0 && (
          <Button className="w-full" onClick={() => setPaying(true)}>
            Pay {formatNaira(e.available)}
          </Button>
        )}
      </CardContent>
      {bank && (
        <BankAccountDialog
          riderId={riderId}
          riderName={riderName}
          current={e.bankAccount}
          onClose={() => setBank(false)}
        />
      )}
      {paying && <PayoutDialog rider={e} onClose={() => setPaying(false)} />}
    </Card>
  );
}

function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'tabular text-success font-semibold' : 'tabular'}>{children}</dd>
    </div>
  );
}
