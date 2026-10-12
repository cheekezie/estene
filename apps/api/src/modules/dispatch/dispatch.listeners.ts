import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { DISPATCH_QUEUE, DispatchService } from './dispatch.service';

export function registerDispatch() {
  bus.on('order.created', ({ orderId }) => getQueue(DISPATCH_QUEUE).add('dispatch-order', { orderId }).then(() => undefined));

  // Manual assignment or cancellation must kill any offer still on a rider's screen.
  bus.on('order.status_changed', async ({ orderId, to }) => {
    if (to === 'assigned' || to === 'cancelled') await DispatchService.withdrawOffers(orderId);
  });

  startWorker(DISPATCH_QUEUE, async (job) => {
    if (job.name === 'dispatch-order') return DispatchService.dispatchOrder(job.data.orderId);
    if (job.name === 'offer-timeout') return DispatchService.expireOffer(job.data.offerId);
  });
}
