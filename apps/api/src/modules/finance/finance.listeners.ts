import { bus } from '../../lib/events';
import { OrderModel } from '../orders/models/order.model';
import { FinanceService } from './finance.service';

export function registerFinance() {
  bus.on('order.paid', ({ orderId }) => FinanceService.recordPaymentReceived(orderId));

  bus.on('order.status_changed', async ({ orderId, to }) => {
    if (to !== 'picked_up' && to !== 'delivered') return;
    const order = await OrderModel.findById(orderId, 'paymentMethod').lean();
    if (!order) return;

    const cashNow =
      (to === 'picked_up' && order.paymentMethod === 'cash_on_pickup') ||
      (to === 'delivered' && order.paymentMethod === 'cash_on_delivery');
    if (cashNow) await FinanceService.recordCashCollected(orderId);
    if (to === 'delivered') await FinanceService.recordDelivery(orderId);
  });
}
