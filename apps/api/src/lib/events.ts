import { EventEmitter } from 'node:events';
import type { ShipmentStatus } from '@estene/contracts/enums';

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
  'shipment.paid': { shipmentId: string };
  'dispatch.offered': { shipmentId: string; riderId: string; offerId: string; expiresAt: Date };
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
