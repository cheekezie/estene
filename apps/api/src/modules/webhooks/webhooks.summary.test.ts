import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS, type ShipmentWebhookEvent } from '@estene/contracts/enums';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';
import { summarize, summarizeInbound, summarizeLowStock, summarizeOrder } from './webhooks.summary';

const shipment = {
  trackingNumber: 'ESTABC123XYZ',
  clientReference: 'SO-10023',
  pickup: { area: 'Wuse II' },
  dropoff: { area: 'Garki II', contactName: 'Ngozi Eze' },
  rider: { firstName: 'Musa' },
  proofOfDelivery: null,
} as unknown as IntegrationShipmentDto;

const order = {
  number: 'ORD-7K2M9XQA',
  reference: 'WEB-1001',
  status: 'shipped' as const,
  recipient: { contactName: 'Ngozi Eze', phone: '+2348030000000', area: null, address: null },
  shipment: { trackingNumber: 'ESTABC123XYZ', trackingUrl: '', status: 'at_hub' as const },
};

describe('webhook summaries', () => {
  it('has a sentence for every subscribable event', () => {
    for (const e of WEBHOOK_EVENTS)
      if (e.startsWith('shipment.'))
        expect(summarize(e as ShipmentWebhookEvent, shipment)).toMatch(/\.$/);
    for (const e of WEBHOOK_EVENTS)
      if (e.startsWith('order.'))
        expect(summarizeOrder(e as Parameters<typeof summarizeOrder>[0], order)).toMatch(/\.$/);
  });

  it('describes warehouse events', () => {
    expect(summarizeOrder('order.shipped', order)).toBe(
      'Order ORD-7K2M9XQA (your ref WEB-1001) was packed and shipped as ESTABC123XYZ.',
    );
    expect(summarizeOrder('order.created', { ...order, status: 'awaiting_stock' })).toMatch(
      /waiting for stock/,
    );
    expect(
      summarizeInbound({
        number: 'IN-AB12CD34',
        reference: null,
        warehouse: 'ABJ-WSE',
        lines: [
          { sku: 'A', expectedQty: 10, receivedQty: 9, damagedQty: 1 },
          { sku: 'B', expectedQty: 5, receivedQty: 5, damagedQty: 0 },
        ],
      }),
    ).toBe('Inbound IN-AB12CD34 was counted at ABJ-WSE: 14 units received, 1 damaged.');
    expect(
      summarizeLowStock({ sku: 'SB-250', name: 'Shea butter', available: 3, warehouse: 'ABJ-WSE' }),
    ).toBe('Shea butter (SB-250) is running low at ABJ-WSE: 3 available.');
  });

  it('names the client reference and recipient', () => {
    expect(summarize('shipment.out_for_delivery', shipment)).toBe(
      'Shipment ESTABC123XYZ (your ref SO-10023) is out for delivery to Ngozi Eze in Garki II.',
    );
  });

  it('formats price changes in naira', () => {
    expect(
      summarize('shipment.price_adjusted', shipment, {
        previousAmount: 250000,
        amount: 320000,
        reason: 'Bigger box',
      }),
    ).toContain('₦2,500 to ₦3,200');
  });
});
