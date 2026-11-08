import { ClientModel } from '../clients/models/client.model';
import { FinanceService } from '../finance/finance.service';
import { monthBounds } from './billing.months';

export const WarehousingBillingService = {
  /**
   * Posts the flat monthly fee for every client that had warehousing on at
   * any point in `month`. Keyed per client and month, so re-running is safe.
   */
  async postStorageFees(month: string) {
    const { start, end } = monthBounds(month);
    const clients = await ClientModel.find(
      {
        'warehousing.monthlyFee': { $gt: 0 },
        'warehousing.enabledAt': { $lt: end },
        $or: [{ 'warehousing.enabled': true }, { 'warehousing.disabledAt': { $gte: start } }],
      },
      'warehousing.monthlyFee',
    ).lean();
    for (const c of clients)
      await FinanceService.recordStorageFee(c._id.toString(), month, c.warehousing!.monthlyFee);
    return { month, billed: clients.length };
  },
};
