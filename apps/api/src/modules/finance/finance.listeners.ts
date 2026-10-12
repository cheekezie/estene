import { bus } from '../../lib/events';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { FinanceService } from './finance.service';

export function registerFinance() {
  bus.on('shipment.paid', ({ shipmentId }) => FinanceService.recordPaymentReceived(shipmentId));

  bus.on('shipment.status_changed', async ({ shipmentId, to }) => {
    if (to !== 'picked_up' && to !== 'delivered') return;
    const shipment = await ShipmentModel.findById(shipmentId, 'paymentMethod').lean();
    if (!shipment) return;

    const cashNow =
      (to === 'picked_up' && shipment.paymentMethod === 'cash_on_pickup') ||
      (to === 'delivered' && shipment.paymentMethod === 'cash_on_delivery');
    if (cashNow) await FinanceService.recordCashCollected(shipmentId);
    if (to === 'delivered') await FinanceService.recordDelivery(shipmentId);
  });
}
