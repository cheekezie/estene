import { bus } from '../../lib/events';
import { FinanceService } from './finance.service';

export function registerFinance() {
  bus.on('payment.succeeded', ({ paymentId }) => FinanceService.recordPayment(paymentId));

  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    if (to === 'delivered' || to === 'collected') await FinanceService.recordDelivery(shipmentId);
  });
}
