import { EventEmitter } from 'node:events';
import type { ShipmentStatus } from '@estene/contracts/enums';
import type { OrderStatus } from '@estene/contracts/warehouse';

/**
 * In-process domain event bus. Services emit facts ("shipment delivered");
 * listeners in other modules react (notify, post ledger entries, dispatch).
 * This keeps modules decoupled — shipments.service never imports notifications.
 *
 * Listeners must be fast and never throw; anything slow or retryable
 * (SMS, email) is handed to a BullMQ queue from inside the listener.
 */
export type DomainEvents = {
  /** A brand-new shipment. Fires exactly once per shipment. */
  'shipment.created': { shipmentId: string };
  /** An existing shipment needs a rider again (e.g. ops removed the assigned rider). */
  'dispatch.requested': { shipmentId: string };
  'shipment.status_changed': {
    shipmentId: string;
    from: ShipmentStatus;
    to: ShipmentStatus;
    actorId: string;
  };
  'shipment.price_adjusted': { shipmentId: string; from: number; to: number; reason?: string };
  /** Money in: a payment row just became successful. One of the two targets is set. */
  'payment.succeeded': { paymentId: string; shipmentId?: string; handlingFeeId?: string };
  /** A handling-fee cycle closed and was billed (including free and no-stock cycles). */
  'handling_fee.billed': { feeId: string };
  /** Ops waived a billed handling fee. */
  'handling_fee.waived': { feeId: string; adminId: string };
  /** A prepaid shipment was re-priced upward and an account number was issued for the difference. */
  'payment.balance_requested': { paymentId: string; shipmentId: string };
  /** Staff booked a prepaid shipment by phone — the sender needs payment details by SMS. */
  'payment.link_requested': { shipmentId: string };
  /** Units became available in a warehouse (received, restocked, released) — retry backorders. */
  'stock.available': { clientId: string; officeId: string };
  /** A warehouse order arrived (any channel). Fires once per order. */
  'order.created': { orderId: string };
  'order.status_changed': { orderId: string; from: OrderStatus; to: OrderStatus };
  /** An inbound (or a transfer) was counted at the warehouse. */
  'inbound.received': { inboundId: string };
  /** A product's available stock fell to the client's threshold. Fires once per dip. */
  'stock.low': { clientId: string; productId: string; officeId: string };
  'dispatch.offered': { shipmentId: string; riderId: string; offerId: string; expiresAt: Date };
  /** Someone applied to ride on the website. */
  'rider_application.submitted': { applicationId: string };
  /** Ops set (or moved) the applicant's vetting appointment. */
  'rider_application.vetting_scheduled': { applicationId: string };
  'rider_application.approved': { applicationId: string; riderId: string };
};

class TypedBus {
  private emitter = new EventEmitter({ captureRejections: true });

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(
    event: K,
    handler: (payload: DomainEvents[K]) => void | Promise<void>,
  ) {
    this.emitter.on(event, async (payload: DomainEvents[K]) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[events] ${event} listener failed`, err);
      }
    });
  }
}

export const bus = new TypedBus();
