import { randomCode } from '../../lib/crypto';
import { paginate } from '../../lib/response';
import { ParcelTagModel } from './models/parcel-tag.model';

export const tagCode = () => `ET${randomCode(8)}`;

export const TagsService = {
  /** Generates a printable batch. Collisions are astronomically unlikely; `ordered: false` skips any anyway. */
  async generateBatch(count: number) {
    const batch = `B${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomCode(4)}`;
    const docs = Array.from({ length: count }, () => ({ code: tagCode(), batch }));
    await ParcelTagModel.insertMany(docs, { ordered: false }).catch(() => undefined);
    return { batch, codes: docs.map((d) => d.code) };
  },

  async list(page: number, limit: number, status?: string) {
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      ParcelTagModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ParcelTagModel.countDocuments(filter),
    ]);
    return paginate(
      items.map((t) => ({
        code: t.code,
        batch: t.batch,
        status: t.status,
        shipment: t.shipment?.toString(),
      })),
      total,
      page,
      limit,
    );
  },
};
