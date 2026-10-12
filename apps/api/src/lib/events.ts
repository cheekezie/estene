import { EventEmitter } from 'node:events';
import type { OrderStatus } from '@estene/contracts/enums';

/**
 * In-process domain event bus. Services emit facts ("order delivered");
 * listeners in other modules react (notify, post ledger entries, dispatch).
 * This keeps modules decoupled — orders.service never imports notifications.
 *
 * Listeners must be fast and never throw; anything slow or retryable
 * (SMS, email) is handed to a BullMQ queue from inside the listener.
 */
export type DomainEvents = {
  'order.created': { orderId: string };
  'order.status_changed': { orderId: string; from: OrderStatus; to: OrderStatus; actorId: string };
  'order.price_adjusted': { orderId: string; from: number; to: number; reason?: string };
  'dispatch.offered': { orderId: string; riderId: string; offerId: string; expiresAt: Date };
};

class TypedBus {
  private emitter = new EventEmitter({ captureRejections: true });

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void | Promise<void>) {
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
