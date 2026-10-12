import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS } from '@estene/contracts/enums';
import type { IntegrationShipmentDto } from '@estene/contracts/shipment';
import { summarize } from './webhooks.summary';

const shipment = {
  trackingNumber: 'ESTABC123XYZ',
  clientReference: 'SO-10023',
  pickup: { area: 'Wuse II' },
  dropoff: { area: 'Garki II', contactName: 'Ngozi Eze' },
  rider: { firstName: 'Musa' },
  proofOfDelivery: null,
} as unknown as IntegrationShipmentDto;

describe('webhook summaries', () => {
  it('has a sentence for every subscribable event', () => {
    for (const e of WEBHOOK_EVENTS) expect(summarize(e, shipment)).toMatch(/\.$/);
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
