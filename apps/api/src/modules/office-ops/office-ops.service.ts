import { Types } from 'mongoose';
import type { ConfirmPickupInput } from '@estene/contracts/shipment';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { ManifestModel } from '../manifests/models/manifest.model';
import { ManifestsService, findByCode } from '../manifests/manifests.service';
import { OfficeModel } from '../offices/models/office.model';
import { PaymentsService } from '../payments/payments.service';
import { ShipmentModel, type ShipmentDoc } from '../shipments/models/shipment.model';
import { SHIPMENT_POPULATE, toShipmentDto } from '../shipments/shipments.mapper';
import { ShipmentsService, type Actor } from '../shipments/shipments.service';

/** Everything a counter can do with a parcel. The scan endpoint returns the subset that applies. */
export type OfficeAction =
  | 'receive_dropoff' // sender brought it in: tag + confirm size/weight
  | 'receive_from_rider' // first-mile rider handing it in: verify tag
  | 'receive_from_manifest' // arrived on a manifest from another office
  | 'add_to_manifest' // waiting here to go to another office
  | 'mark_ready_for_collection'
  | 'hand_to_recipient' // recipient at the counter with their PIN
  | 'dispatch_for_delivery'; // needs a last-mile rider from here

/** Compares ids whether a reference is a raw ObjectId/string or a populated document. */
const idOf = (v: unknown) =>
  v && typeof v === 'object' && '_id' in v
    ? String((v as { _id: unknown })._id)
    : v
      ? String(v)
      : '';
const same = (a: unknown, b: unknown) => !!idOf(a) && idOf(a) === idOf(b);

/** Which actions make sense for this parcel at this office right now. */
export async function allowedActions(s: ShipmentDoc, officeId: string): Promise<OfficeAction[]> {
  const f = s.fulfilment;
  const here = same(s.currentOffice, officeId);
  const actions: OfficeAction[] = [];
  if (s.status === 'created' && f?.originMode === 'dropoff' && same(f.originOffice, officeId))
    actions.push('receive_dropoff');
  if (['picked_up', 'en_route_to_pickup'].includes(s.status) && same(f?.originOffice, officeId))
    actions.push('receive_from_rider');
  if (s.status === 'in_transit' && s.manifest) {
    const m = await ManifestModel.findById(s.manifest, 'toOffice').lean();
    if (same(m?.toOffice, officeId)) actions.push('receive_from_manifest');
  }
  if (s.status === 'at_hub' && here) {
    const finalOffice = same(f?.destinationOffice, officeId);
    if (!finalOffice && !s.manifest) actions.push('add_to_manifest');
    if (finalOffice && f?.deliveryMode === 'collection') actions.push('mark_ready_for_collection');
    if (
      finalOffice &&
      f?.deliveryMode === 'door' &&
      s.dispatch.state !== 'searching' &&
      s.dispatch.state !== 'offered'
    )
      actions.push('dispatch_for_delivery');
  }
  if (s.status === 'ready_for_collection' && here) actions.push('hand_to_recipient');
  return actions;
}

async function requireAction(
  code: string | Types.ObjectId,
  officeId: string,
  action: OfficeAction,
) {
  const s =
    typeof code === 'string' && !/^[a-f\d]{24}$/i.test(code)
      ? await findByCode(code)
      : await ShipmentModel.findById(code);
  if (!s) throw notFound('No parcel matches that code');
  if (!(await allowedActions(s, officeId)).includes(action))
    throw badRequest(
      `${s.trackingNumber} can’t be ${action.replace(/_/g, ' ')} here right now`,
      'ACTION_NOT_ALLOWED',
    );
  return s;
}

const reload = async (id: Types.ObjectId | string) =>
  toShipmentDto((await ShipmentModel.findById(id).populate(SHIPMENT_POPULATE))!);

export const OfficeOpsService = {
  /** Scanner entry point: QR tag code or tracking number → parcel + what you can do with it. */
  async scan(officeId: string, code: string) {
    const s = await findByCode(code);
    if (!s) throw notFound('No parcel matches that code');
    return { shipment: await reload(s._id), actions: await allowedActions(s, officeId) };
  },

  /** Sender dropped the parcel at the counter: same checks a rider does at pickup. Cash-at-pickup is taken here. */
  async receiveDropoff(
    officeId: string,
    shipmentId: string,
    input: ConfirmPickupInput,
    actor: Actor,
  ) {
    const s = await requireAction(shipmentId, officeId, 'receive_dropoff');
    const dto = await ShipmentsService.acceptParcel(s, 'at_hub', actor, input, {
      currentOffice: new Types.ObjectId(officeId),
    });
    if (s.paymentMethod === 'cash_on_pickup') {
      await PaymentsService.recordManual(s.id, actor.id!, {
        note: 'Cash paid at office drop-off',
      }).catch(() => undefined);
    }
    return reload(dto.id);
  },

  /** First-mile rider hands the parcel in. Their leg ends here and they're free for the next job. */
  async receiveFromRider(officeId: string, code: string, actor: Actor) {
    const s = await requireAction(code, officeId, 'receive_from_rider');
    if (!s.tagCode || s.tagCode !== code.trim().toUpperCase())
      throw badRequest('Scan the parcel’s QR tag to confirm the hand-in', 'TAG_REQUIRED');
    const leg = s.rider
      ? await ShipmentsService.riderLeg(s, s.rider.toString(), 'first_mile')
      : null;
    await ShipmentsService.transition(s.id, 'at_hub', actor, {
      note: 'Handed in by rider',
      set: {
        $set: {
          currentOffice: new Types.ObjectId(officeId),
          rider: null,
          'dispatch.state': 'assigned',
        },
        ...(leg && { $push: { riderLegs: leg } }),
      },
    });
    return reload(s._id);
  },

  async receiveFromManifest(officeId: string, code: string, actor: Actor) {
    const s = await requireAction(code, officeId, 'receive_from_manifest');
    await ManifestsService.receive(String(s.manifest), code, actor);
    return reload(s._id);
  },

  /** Recipient will collect: SMS goes out with the office address and their PIN. */
  async markReadyForCollection(officeId: string, shipmentId: string, actor: Actor) {
    const s = await requireAction(shipmentId, officeId, 'mark_ready_for_collection');
    await ShipmentsService.transition(s.id, 'ready_for_collection', actor);
    return reload(s._id);
  },

  /** Recipient at the counter: PIN checked, any balance settled, parcel handed over. */
  async handToRecipient(
    officeId: string,
    shipmentId: string,
    input: { pin: string; receivedBy?: string; collectCash?: boolean },
    actor: Actor,
  ) {
    const s = await requireAction(shipmentId, officeId, 'hand_to_recipient');
    await ShipmentsService.verifyRecipientPin(s, input.pin);
    if (s.paymentMethod === 'cash_on_delivery' || input.collectCash) {
      if (PaymentsService.outstanding(s) > 0)
        await PaymentsService.recordManual(s.id, actor.id!, {
          note: 'Cash paid at office collection',
        });
    }
    ShipmentsService.assertNothingOwed((await ShipmentModel.findById(s._id))!);
    await ShipmentsService.transition(s.id, 'collected', actor, {
      note: input.receivedBy ? `Collected by ${input.receivedBy}` : undefined,
      set: {
        $set: {
          currentOffice: null,
          deliveredAt: new Date(),
          proof: { method: 'pin', receivedBy: input.receivedBy, at: new Date() },
        },
      },
    });
    return reload(s._id);
  },

  /** Put a parcel waiting here into dispatch for its last mile. */
  async dispatchForDelivery(officeId: string, shipmentId: string) {
    const s = await requireAction(shipmentId, officeId, 'dispatch_for_delivery');
    await ShipmentModel.updateOne(
      { _id: s._id },
      { 'dispatch.state': 'searching', 'dispatch.attempts': 0, 'dispatch.declinedBy': [] },
    );
    bus.emit('dispatch.requested', { shipmentId: s.id });
    return reload(s._id);
  },

  /** The counter's to-do list. */
  async queue(officeId: string) {
    const office = await OfficeModel.findById(officeId, 'name code');
    if (!office) throw notFound('Office not found');
    const oid = new Types.ObjectId(officeId);
    const find = (filter: object) =>
      ShipmentModel.find(filter).populate(SHIPMENT_POPULATE).sort({ updatedAt: -1 }).limit(100);
    const [
      expectedDropoffs,
      incomingRiders,
      inOffice,
      readyForCollection,
      incomingManifests,
      outgoingManifests,
    ] = await Promise.all([
      find({
        status: { $in: ['created', 'awaiting_payment'] },
        'fulfilment.originMode': 'dropoff',
        'fulfilment.originOffice': oid,
      }),
      find({
        status: { $in: ['assigned', 'en_route_to_pickup', 'picked_up'] },
        'fulfilment.originMode': 'pickup',
        'fulfilment.originOffice': oid,
        currentOffice: null,
      }),
      find({ status: { $in: ['at_hub', 'assigned'] }, currentOffice: oid }),
      find({ status: 'ready_for_collection', currentOffice: oid }),
      ManifestModel.find({ toOffice: oid, status: { $in: ['in_transit', 'arrived'] } }).populate([
        {
          path: 'fromOffice',
          select: 'name code zone',
          populate: { path: 'zone', select: 'city' },
        },
        { path: 'toOffice', select: 'name code zone', populate: { path: 'zone', select: 'city' } },
        { path: 'shipments.shipment', select: 'trackingNumber tagCode status dropoff.area' },
        { path: 'createdBy', select: 'name' },
      ]),
      ManifestModel.find({ fromOffice: oid, status: 'open' }).populate([
        {
          path: 'fromOffice',
          select: 'name code zone',
          populate: { path: 'zone', select: 'city' },
        },
        { path: 'toOffice', select: 'name code zone', populate: { path: 'zone', select: 'city' } },
        { path: 'shipments.shipment', select: 'trackingNumber tagCode status dropoff.area' },
        { path: 'createdBy', select: 'name' },
      ]),
    ]);

    const toSend = inOffice.filter((s) => !same(s.fulfilment?.destinationOffice, officeId));
    const finalHere = inOffice.filter((s) => same(s.fulfilment?.destinationOffice, officeId));
    return {
      office: { id: office.id, name: office.name, code: office.code },
      expectedDropoffs: expectedDropoffs.map(toShipmentDto),
      incomingRiders: incomingRiders.map(toShipmentDto),
      toSend: toSend.map(toShipmentDto),
      toPrepareForCollection: finalHere
        .filter((s) => s.fulfilment?.deliveryMode === 'collection' && s.status === 'at_hub')
        .map(toShipmentDto),
      awaitingRider: finalHere
        .filter((s) => s.fulfilment?.deliveryMode === 'door')
        .map(toShipmentDto),
      readyForCollection: readyForCollection.map(toShipmentDto),
      incomingManifests: incomingManifests.map(ManifestsService.toDto),
      openManifests: outgoingManifests.map(ManifestsService.toDto),
    };
  },
};

/** Office agents are tied to one office; ops/admins can act for any. */
export function assertOfficeAccess(user: { role?: string; officeId?: string }, officeId: string) {
  if (user.role === 'office_agent' && user.officeId !== officeId)
    throw forbidden('You can only work at your own office');
}
