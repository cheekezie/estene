import { bus } from '../../lib/events';
import { OrdersService } from './orders.service';

export function registerWarehousing() {
  bus.on('shipment.status_changed', ({ shipmentId, to }) =>
    OrdersService.syncFromShipment(shipmentId, to),
  );

  bus.on('stock.available', ({ clientId, officeId }) =>
    OrdersService.retryBackorders(clientId, officeId),
  );
}
