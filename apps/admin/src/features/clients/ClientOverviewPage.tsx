import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Banknote, Globe, Mail, MapPin, Package, Phone, Truck, UserRound } from 'lucide-react';
import { CLIENT_INDUSTRY_LABELS } from '@estene/contracts/client';
import { formatNaira } from '@estene/contracts/money';
import { formatDate } from '@estene/lib/date';
import { formatPhone } from '@estene/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { StatTile } from '@/shared/components/StatTile';
import { useClientContext } from './ClientLayout';

export default function ClientOverviewPage() {
  const { client: c } = useClientContext();
  const overLimit = c.billing.creditLimit != null && c.stats.outstanding > c.billing.creditLimit;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Shipments" value={c.stats.shipments} icon={Package} />
        <StatTile label="In progress" value={c.stats.activeShipments} icon={Truck} />
        <StatTile
          label="Outstanding on account"
          value={formatNaira(c.stats.outstanding)}
          hint={
            c.billing.creditLimit
              ? `${overLimit ? 'Over' : 'Within'} ${formatNaira(c.billing.creditLimit)} limit`
              : 'Delivered, not yet paid'
          }
          icon={Banknote}
          highlight={c.stats.outstanding > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Trading name">{c.name}</Row>
              <Row label="Legal name">{c.legalName ?? '—'}</Row>
              <Row label="Industry">{CLIENT_INDUSTRY_LABELS[c.industry]}</Row>
              <Row label="CAC number">{c.rcNumber ?? '—'}</Row>
              <Row label="Website">
                {c.website ? (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Globe className="size-3.5" />
                    {new URL(c.website).hostname}
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Expected volume">
                {c.expectedMonthlyVolume ? `${c.expectedMonthlyVolume} shipments / month` : '—'}
              </Row>
              <Row label="Client since">{formatDate(c.createdAt)}</Row>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Primary contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <UserRound className="text-muted-foreground size-4" />
                {c.contact.name}
                {c.contact.role && (
                  <span className="text-muted-foreground font-normal">· {c.contact.role}</span>
                )}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="text-muted-foreground size-4" />
                <a href={`tel:${c.contact.phone}`} className="hover:underline">
                  {formatPhone(c.contact.phone)}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="text-muted-foreground size-4" />
                <a href={`mailto:${c.contact.email}`} className="hover:underline">
                  {c.contact.email}
                </a>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Address</CardTitle>
              {c.address.zone && (
                <span className="text-muted-foreground text-xs">
                  Pickup zone {c.address.zone.code}
                </span>
              )}
            </CardHeader>
            <CardContent className="text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span>
                  {c.address.line}
                  {c.address.area && `, ${c.address.area}`}
                  <br />
                  {c.address.city}, {c.address.state}
                  {c.address.landmark && (
                    <>
                      <br />
                      <span className="text-muted-foreground">Near {c.address.landmark}</span>
                    </>
                  )}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Billing & account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Payment terms">
                {c.billing.paymentTermsDays === 0
                  ? 'Pay per shipment'
                  : `Net ${c.billing.paymentTermsDays} days`}
              </Row>
              <Row label="Credit limit">
                {c.billing.creditLimit ? formatNaira(c.billing.creditLimit) : 'No limit'}
              </Row>
              <Row label="Billing email">{c.billing.email ?? c.contact.email}</Row>
              <Row label="Account manager">{c.accountManager?.name ?? 'Unassigned'}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipments & notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link
              to={`/shipments?clientId=${c.id}`}
              className="text-primary font-medium hover:underline"
            >
              View all {c.stats.shipments} shipments →
            </Link>
            <p className="text-muted-foreground whitespace-pre-line">{c.notes ?? 'No notes.'}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
