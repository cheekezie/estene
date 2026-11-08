import type { Types } from 'mongoose';
import type { ParcelSize, ShipmentStatus } from '@estene/contracts/enums';
import {
  ORDER_STATUS_META,
  suggestParcel,
  type InboundDto,
  type IntegrationInboundDto,
  type IntegrationOrderDto,
  type IntegrationStockDto,
  type OrderDto,
  type ProductDto,
  type StockLevelDto,
  type StockMovementDto,
} from '@estene/contracts/warehouse';
import { env } from '../../config/env';
import type { IInbound } from './models/inbound.model';
import type { IOrder } from './models/order.model';
import type { IProduct } from './models/product.model';
import type { IStockLevel } from './models/stock-level.model';
import type { IStockMovement } from './models/stock-movement.model';

type Ref<T> = T & { _id: Types.ObjectId };
type OfficeRef = Ref<{ name: string; code: string }>;
type NamedRef = Ref<{ name: string }>;
type ProductRef = Ref<Pick<IProduct, 'sku' | 'name' | 'size' | 'weightKg' | 'isActive'>>;
type ShipmentRef = Ref<{ trackingNumber: string; status: ShipmentStatus }>;

const iso = (d?: Date | null) => d?.toISOString() ?? null;
const office = (o: unknown) => {
  const r = o as OfficeRef;
  return { id: r._id.toString(), name: r.name, code: r.code };
};
const named = (o: unknown) => {
  const r = o as NamedRef;
  return { id: r._id.toString(), name: r.name };
};

export const STOCK_POPULATE = [
  { path: 'product', select: 'sku name size isActive' },
  { path: 'office', select: 'name code' },
];
export const MOVEMENT_POPULATE = [
  { path: 'product', select: 'sku name' },
  { path: 'office', select: 'code' },
  { path: 'inbound', select: 'number' },
  { path: 'order', select: 'number' },
];
export const INBOUND_POPULATE = [
  { path: 'client', select: 'name' },
  { path: 'office', select: 'name code' },
  { path: 'transferFrom', select: 'name code' },
  { path: 'lines.product', select: 'sku name' },
  { path: 'receivedBy', select: 'name' },
];
export const ORDER_POPULATE = [
  { path: 'client', select: 'name' },
  { path: 'office', select: 'name code' },
  { path: 'destinationOffice', select: 'name code' },
  { path: 'recipient.zone', select: 'name' },
  { path: 'lines.product', select: 'sku name size weightKg' },
  { path: 'shipment', select: 'trackingNumber status' },
];

export function toProductDto(p: IProduct): ProductDto {
  return {
    id: p._id.toString(),
    sku: p.sku,
    name: p.name,
    barcode: p.barcode,
    size: p.size,
    weightKg: p.weightKg,
    declaredValue: p.declaredValue,
    fragile: p.fragile,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toStockDto(s: IStockLevel, lowThreshold: number): StockLevelDto {
  const p = s.product as unknown as ProductRef;
  const available = s.onHand - s.reserved;
  return {
    product: { id: p._id.toString(), sku: p.sku, name: p.name, size: p.size, isActive: p.isActive },
    office: office(s.office),
    onHand: s.onHand,
    reserved: s.reserved,
    available,
    bin: s.bin ?? null,
    low: available <= lowThreshold,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toMovementDto(
  m: IStockMovement,
  actorNames: Map<string, string> = new Map(),
): StockMovementDto {
  const p = m.product as unknown as ProductRef;
  const inbound = m.inbound as unknown as { number?: string } | undefined;
  const order = m.order as unknown as { number?: string } | undefined;
  return {
    id: m._id.toString(),
    type: m.type,
    product: { id: p._id.toString(), sku: p.sku, name: p.name },
    office: { code: (m.office as unknown as OfficeRef).code },
    qty: m.qty,
    onHandAfter: m.onHandAfter,
    reference: inbound?.number ?? order?.number ?? null,
    note: m.note ?? null,
    by:
      m.actorType === 'system'
        ? 'System'
        : m.actorType === 'client'
          ? 'Client'
          : (m.actorId && actorNames.get(m.actorId.toString())) || 'Staff',
    at: m.createdAt.toISOString(),
  };
}

export function toInboundDto(i: IInbound): InboundDto {
  return {
    id: i._id.toString(),
    number: i.number,
    reference: i.reference ?? null,
    client: named(i.client),
    office: office(i.office),
    transferFrom: i.transferFrom ? office(i.transferFrom) : null,
    status: i.status,
    lines: i.lines.map((l) => {
      const p = l.product as unknown as ProductRef;
      return {
        product: { id: p._id.toString(), sku: p.sku, name: p.name },
        expectedQty: l.expectedQty,
        receivedQty: l.receivedQty,
        damagedQty: l.damagedQty,
      };
    }),
    expectedAt: iso(i.expectedAt),
    receivedAt: iso(i.receivedAt),
    receivedBy: (i.receivedBy as unknown as NamedRef | undefined)?.name ?? null,
    notes: i.notes ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export function toOrderDto(o: IOrder, bins: Map<string, string | null> = new Map()): OrderDto {
  const zone = o.recipient.zone as unknown as NamedRef | undefined;
  const shipment = o.shipment as unknown as ShipmentRef | null;
  const lines = o.lines.map((l) => {
    const p = l.product as unknown as ProductRef;
    const id = p._id.toString();
    return {
      product: { id, sku: p.sku, name: p.name, size: p.size, weightKg: p.weightKg },
      qty: l.qty,
      bin: bins.get(id) ?? null,
    };
  });
  return {
    id: o._id.toString(),
    number: o.number,
    reference: o.reference ?? null,
    source: o.source,
    client: named(o.client),
    office: office(o.office),
    status: o.status,
    recipient: {
      contactName: o.recipient.contactName,
      phone: o.recipient.phone,
      area: o.recipient.area ?? null,
      address: o.recipient.address ?? null,
      landmark: o.recipient.landmark ?? null,
      zone: zone ? { id: zone._id.toString(), name: zone.name } : null,
    },
    deliveryMode: o.deliveryMode,
    destinationOffice: o.destinationOffice ? office(o.destinationOffice) : null,
    serviceLevel: o.serviceLevel,
    paymentMethod: o.paymentMethod,
    lines,
    suggestedParcel: suggestParcel(
      lines.map((l) => ({
        size: l.product.size as ParcelSize,
        weightKg: l.product.weightKg,
        qty: l.qty,
      })),
    ),
    shipment: shipment
      ? {
          id: shipment._id.toString(),
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
        }
      : null,
    notes: o.notes ?? null,
    restockedAt: iso(o.restockedAt),
    events: o.events.map((e) => ({
      status: e.status,
      note: e.note,
      actor: e.actorType,
      at: e.at.toISOString(),
    })),
    createdAt: o.createdAt.toISOString(),
  };
}

// ── Integration API views: no internal ids beyond the record's own ──────────

const trackingUrl = (tn: string) => `${env.PUBLIC_SITE_URL}/track/${tn}`;

export function toIntegrationOrderDto(o: IOrder): IntegrationOrderDto {
  const shipment = o.shipment as unknown as ShipmentRef | null;
  return {
    id: o._id.toString(),
    number: o.number,
    reference: o.reference ?? null,
    status: o.status,
    statusLabel: ORDER_STATUS_META[o.status].label,
    recipient: {
      contactName: o.recipient.contactName,
      phone: o.recipient.phone,
      area: o.recipient.area ?? null,
      address: o.recipient.address ?? null,
    },
    deliveryMode: o.deliveryMode,
    serviceLevel: o.serviceLevel,
    lines: o.lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty })),
    shipment: shipment
      ? {
          trackingNumber: shipment.trackingNumber,
          trackingUrl: trackingUrl(shipment.trackingNumber),
          status: shipment.status,
        }
      : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function toIntegrationStockDto(s: IStockLevel): IntegrationStockDto {
  const p = s.product as unknown as ProductRef;
  return {
    sku: p.sku,
    name: p.name,
    onHand: s.onHand,
    reserved: s.reserved,
    available: s.onHand - s.reserved,
    warehouse: (s.office as unknown as OfficeRef).code,
  };
}

export function toIntegrationInboundDto(i: IInbound): IntegrationInboundDto {
  return {
    id: i._id.toString(),
    number: i.number,
    reference: i.reference ?? null,
    status: i.status,
    warehouse: (i.office as unknown as OfficeRef).code,
    transferFrom: i.transferFrom ? (i.transferFrom as unknown as OfficeRef).code : null,
    lines: i.lines.map((l) => ({
      sku: (l.product as unknown as ProductRef).sku,
      expectedQty: l.expectedQty,
      receivedQty: l.receivedQty,
      damagedQty: l.damagedQty,
    })),
    expectedAt: iso(i.expectedAt),
    receivedAt: iso(i.receivedAt),
    createdAt: i.createdAt.toISOString(),
  };
}
