import { Types } from 'mongoose';
import type { StockTransferInput } from '@estene/contracts/warehouse';
import { badRequest, conflict } from '../../lib/errors';
import { OfficeModel } from '../offices/models/office.model';
import { InboundModel } from './models/inbound.model';
import { StockService, type StockActor } from './stock.service';
import { INBOUND_POPULATE, toInboundDto } from './warehousing.mapper';
import { generateNumber, resolveLines, warehousingClient } from './warehousing.service';

/**
 * Moving a client's stock between Estene warehouses. The units leave the
 * origin straight away (`transferred_out`) and travel as an inbound at the
 * destination, which is counted on arrival like any delivery. Cancelling that
 * inbound before it is received puts the units back at the origin.
 */
export const TransfersService = {
  async create(input: StockTransferInput, actor: StockActor) {
    await warehousingClient(input.clientId);
    const offices = await OfficeModel.find(
      { _id: { $in: [input.fromOfficeId, input.toOfficeId] }, isActive: true },
      'code isWarehouse',
    ).lean();
    const from = offices.find((o) => o._id.toString() === input.fromOfficeId);
    const to = offices.find((o) => o._id.toString() === input.toOfficeId);
    if (!from) throw badRequest('Choose the warehouse the stock is in');
    if (!to?.isWarehouse)
      throw badRequest('Stock can only move to an office set up as a warehouse');

    const lines = await resolveLines(input.clientId, input.lines, (l) => l.qty);
    const inboundId = new Types.ObjectId();
    const note = `Transfer ${from.code} → ${to.code}`;
    const ok = await StockService.transferOut(
      from._id,
      inboundId,
      lines.map((l) => ({ product: l.product._id, qty: l.qty })),
      actor,
      note,
    );
    if (!ok)
      throw conflict(
        'Not enough available stock to move — units reserved for orders stay where they are',
        'INSUFFICIENT_STOCK',
      );

    try {
      await InboundModel.create({
        _id: inboundId,
        client: input.clientId,
        office: to._id,
        transferFrom: from._id,
        number: await generateNumber('IN'),
        notes: [note, input.notes].filter(Boolean).join(' · '),
        lines: lines.map((l) => ({ product: l.product._id, expectedQty: l.qty })),
      });
    } catch (err) {
      // Never lose units in a half-made transfer: put them back where they were.
      for (const l of lines)
        await StockService.add(
          new Types.ObjectId(input.clientId),
          from._id,
          l.product._id,
          l.qty,
          'transferred_in',
          actor,
          `transfer:${inboundId}:undo:${l.product._id}`,
          { note: 'Transfer could not be created' },
        );
      throw err;
    }
    return toInboundDto((await InboundModel.findById(inboundId).populate(INBOUND_POPULATE))!);
  },
};
