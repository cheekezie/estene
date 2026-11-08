import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { SERVICE_LEVEL_META } from '@estene/contracts/enums';
import { formatDateTime } from '@estene/lib/date';
import { formatPhone } from '@estene/lib/utils';
import { Button } from '@estene/ui/button';
import { Logo } from '@estene/ui/Logo';
import { QueryState } from '@/shared/components/QueryState';
import { useOrder } from './warehouse.queries';

/**
 * /warehouse/orders/:id/print — the pick list (for the shelf) and the packing
 * slip (goes in the parcel), one per printed page. Opens the print dialog once loaded.
 */
export default function OrderPrintPage() {
  const { id = '' } = useParams();
  const q = useOrder(id);
  const o = q.data;

  useEffect(() => {
    if (!o) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [o]);

  const units = o?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white; } }`}</style>
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {o && (
          <>
            {/* ── Pick list ── */}
            <section className="break-after-page">
              <header className="mb-6 flex items-start justify-between border-b pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pick list
                  </p>
                  <h1 className="font-mono text-2xl font-bold">{o.number}</h1>
                  <p className="text-sm text-slate-600">
                    {o.client.name} · {o.office.name} ({o.office.code})
                  </p>
                </div>
                <div className="text-right text-sm text-slate-600">
                  <p>{SERVICE_LEVEL_META[o.serviceLevel].label}</p>
                  <p>Ordered {formatDateTime(o.createdAt)}</p>
                  <p>Printed {formatDateTime(new Date().toISOString())}</p>
                </div>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="w-8 py-2" />
                    <th className="py-2">Bin</th>
                    <th className="py-2">SKU</th>
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {[...o.lines]
                    .sort((a, b) => (a.bin ?? '~').localeCompare(b.bin ?? '~'))
                    .map((l) => (
                      <tr key={l.product.id} className="border-b">
                        <td className="py-3">
                          <span className="inline-block size-4 rounded-sm border border-slate-400" />
                        </td>
                        <td className="py-3 font-mono font-semibold">{l.bin ?? '—'}</td>
                        <td className="py-3 font-mono">{l.product.sku}</td>
                        <td className="py-3">{l.product.name}</td>
                        <td className="py-3 text-right text-lg font-bold">{l.qty}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-4 text-right text-sm">
                {units} unit{units === 1 ? '' : 's'} · suggested parcel {o.suggestedParcel.size},
                about {o.suggestedParcel.weightKg} kg
              </p>
              <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
                <p className="border-t pt-2 text-slate-500">Picked by</p>
                <p className="border-t pt-2 text-slate-500">Checked by</p>
              </div>
            </section>

            {/* ── Packing slip ── */}
            <section className="pt-8 print:pt-0">
              <header className="mb-6 flex items-start justify-between border-b pb-4">
                <Logo />
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Packing slip
                  </p>
                  <p className="font-mono font-bold">{o.number}</p>
                  {o.reference && <p className="text-sm text-slate-600">Your ref {o.reference}</p>}
                  {o.shipment && (
                    <p className="font-mono text-sm">Tracking {o.shipment.trackingNumber}</p>
                  )}
                </div>
              </header>
              <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">From</p>
                  <p className="font-medium">{o.client.name}</p>
                  <p className="text-slate-600">via Estene, {o.office.name}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Deliver to</p>
                  <p className="font-medium">{o.recipient.contactName}</p>
                  <p className="text-slate-600">{formatPhone(o.recipient.phone)}</p>
                  {o.deliveryMode === 'collection' ? (
                    <p className="text-slate-600">Collect at {o.destinationOffice?.name}</p>
                  ) : (
                    <p className="text-slate-600">
                      {o.recipient.address}, {o.recipient.area}
                      {o.recipient.landmark && ` (${o.recipient.landmark})`}
                    </p>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Item</th>
                    <th className="py-2">SKU</th>
                    <th className="py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.product.id} className="border-b">
                      <td className="py-2">{l.product.name}</td>
                      <td className="py-2 font-mono">{l.product.sku}</td>
                      <td className="py-2 text-right font-semibold">{l.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.notes && <p className="mt-4 text-sm text-slate-600">Note: {o.notes}</p>}
              <p className="mt-10 text-center text-xs text-slate-500">
                Something missing or damaged? Contact {o.client.name} with order {o.number}.
              </p>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
