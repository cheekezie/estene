import { describe, expect, it } from 'vitest';
import { OrderCreateSchema, orderStatusForShipment, suggestParcel } from './warehouse';

describe('suggestParcel', () => {
  it('takes the largest unit size and sums weight across quantities', () => {
    expect(
      suggestParcel([
        { size: 'small', weightKg: 0.4, qty: 3 },
        { size: 'medium', weightKg: 1.25, qty: 1 },
      ]),
    ).toEqual({ size: 'medium', weightKg: 2.45 });
  });

  it('never suggests a zero weight', () => {
    expect(suggestParcel([{ size: 'envelope', weightKg: 0.01, qty: 1 }]).weightKg).toBe(0.1);
  });
});

describe('orderStatusForShipment', () => {
  it('maps shipment outcomes onto the order', () => {
    expect(orderStatusForShipment('delivered')).toBe('delivered');
    expect(orderStatusForShipment('collected')).toBe('delivered');
    expect(orderStatusForShipment('returned')).toBe('returned');
    expect(orderStatusForShipment('cancelled')).toBe('returned');
  });

  it('ignores in-flight statuses', () => {
    expect(orderStatusForShipment('at_hub')).toBeNull();
    expect(orderStatusForShipment('out_for_delivery')).toBeNull();
    expect(orderStatusForShipment('delivery_failed')).toBeNull();
  });
});

describe('OrderCreateSchema', () => {
  const base = {
    recipient: { contactName: 'Ada Obi', phone: '08031234567' },
    lines: [{ sku: 'SHEA-250', qty: 2 }],
  };

  it('requires an address for door delivery', () => {
    const r = OrderCreateSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(
      expect.arrayContaining(['recipient.zoneId', 'recipient.area', 'recipient.address']),
    );
  });

  it('requires an office for collection, but no address', () => {
    expect(OrderCreateSchema.safeParse({ ...base, deliveryMode: 'collection' }).success).toBe(
      false,
    );
    const r = OrderCreateSchema.safeParse({
      ...base,
      deliveryMode: 'collection',
      destinationOfficeId: '64b7f0c2a1b2c3d4e5f60718',
    });
    expect(r.success).toBe(true);
    expect(r.data?.paymentMethod).toBe('on_account');
    expect(r.data?.recipient.phone).toBe('+2348031234567');
  });

  it('needs a productId or sku on every line', () => {
    const r = OrderCreateSchema.safeParse({
      ...base,
      deliveryMode: 'collection',
      destinationOfficeId: '64b7f0c2a1b2c3d4e5f60718',
      lines: [{ qty: 1 }],
    });
    expect(r.success).toBe(false);
  });
});
