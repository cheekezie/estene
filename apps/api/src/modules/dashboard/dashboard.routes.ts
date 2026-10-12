import type { FastifyInstance } from 'fastify';
import type { OrderStatus } from '@estene/contracts/enums';
import { send } from '../../lib/response';
import { requireActor } from '../../plugins/auth';
import { OrderModel } from '../orders/models/order.model';
import { RiderModel } from '../riders/models/rider.model';
import { PresenceService } from '../riders/presence.service';
import { LedgerEntryModel } from '../finance/models/ledger-entry.model';

const DAY_MS = 86_400_000;
/** WAT is a fixed UTC+1 (no DST) — "today" must not depend on the server's timezone. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const startOfLagosDay = () => new Date(Math.floor((Date.now() + LAGOS_OFFSET_MS) / DAY_MS) * DAY_MS - LAGOS_OFFSET_MS);

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));

  /** Ops overview: today's flow, what needs attention, and network capacity. */
  app.get('/overview', async (_req, reply) => {
    const startOfDay = startOfLagosDay();

    const [byStatus, todayCount, deliveredToday, needsRider, activeRiders, online, revenue, last7] = await Promise.all([
      OrderModel.aggregate<{ _id: OrderStatus; n: number }>([
        { $match: { status: { $nin: ['delivered', 'cancelled', 'returned'] } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      OrderModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      OrderModel.countDocuments({ deliveredAt: { $gte: startOfDay } }),
      OrderModel.countDocuments({ status: 'created', 'dispatch.state': 'unassigned' }),
      RiderModel.countDocuments({ status: 'active' }),
      PresenceService.allOnline(),
      LedgerEntryModel.aggregate<{ total: number }>([
        { $match: { type: 'platform_revenue', createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      OrderModel.aggregate<{ _id: string; booked: number; delivered: number }>([
        { $match: { createdAt: { $gte: new Date(startOfDay.getTime() - 6 * DAY_MS) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Lagos' } },
            booked: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return send(reply, {
      today: { booked: todayCount, delivered: deliveredToday, revenue: revenue[0]?.total ?? 0 },
      pipeline: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      needsRider,
      riders: { active: activeRiders, online: online.length },
      last7Days: last7.map((d) => ({ date: d._id, booked: d.booked, delivered: d.delivered })),
    });
  });
}
