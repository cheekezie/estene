import { bus } from '../../lib/events';
import { getQueue, startWorker } from '../../lib/queue';
import { DISPATCH_QUEUE, DispatchService } from './dispatch.service';

export function registerDispatch() {
  const enqueue = ({ shipmentId }: { shipmentId: string }) =>
    getQueue(DISPATCH_QUEUE)
      .add('dispatch-shipment', { shipmentId })
      .then(() => undefined);
  bus.on('shipment.created', enqueue);
  bus.on('dispatch.requested', enqueue);

  // Manual assignment or cancellation must kill any offer still on a rider's screen.
  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    if (to === 'assigned' || to === 'cancelled') await DispatchService.withdrawOffers(shipmentId);
  });

  startWorker(DISPATCH_QUEUE, async (job) => {
    if (job.name === 'dispatch-shipment')
      return DispatchService.dispatchShipment(job.data.shipmentId);
    if (job.name === 'offer-timeout') return DispatchService.expireOffer(job.data.offerId);
  });
}
