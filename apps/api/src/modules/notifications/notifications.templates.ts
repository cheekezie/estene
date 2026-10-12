import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { formatNaira } from '@estene/contracts/money';
import type { ShipmentStatus } from '@estene/contracts/enums';

const TRACK_URL = 'estene.ng/track';

type Account = { accountNumber: string; bankName: string; accountName: string };

/** SMS copy. Kept under 160 chars where possible — every extra segment costs money. */
export const templates = {
  payOnline: (tn: string) =>
    `Estene: complete payment for ${tn} to dispatch a rider. Pay online: ${TRACK_URL}/${tn}`,

  payByTransfer: (tn: string, amount: number, a: Account) =>
    `Estene: send exactly ${formatNaira(amount)} to ${a.accountNumber} (${a.bankName}, ${a.accountName}) for ${tn}. We dispatch a rider once it lands.`,

  balanceDue: (tn: string, amount: number, a: Account) =>
    `Estene: ${tn} costs ${formatNaira(amount)} more after the rider checked it. Send it to ${a.accountNumber} (${a.bankName}) or pay at ${TRACK_URL}/${tn} before delivery.`,

  senderStatus: (tn: string, status: ShipmentStatus) =>
    `Estene: ${tn} — ${SHIPMENT_STATUS_META[status].label}. ${SHIPMENT_STATUS_META[status].description} Track: ${TRACK_URL}/${tn}`,

  receiverPickedUp: (tn: string, senderName: string) =>
    `Estene: ${senderName} sent you a parcel (${tn}). We'll text you when it's out for delivery. Track: ${TRACK_URL}/${tn}`,

  receiverOutForDelivery: (tn: string, pin: string) =>
    `Estene: your parcel ${tn} is out for delivery. Give the rider PIN ${pin} on arrival. Never share it before you receive the parcel.`,

  receiverReadyForCollection: (
    tn: string,
    office: { name: string; address: string; openingHours: string },
    pin: string,
  ) =>
    `Estene: parcel ${tn} is ready to collect at ${office.name}, ${office.address} (${office.openingHours}). Show PIN ${pin} at the counter.`,

  receiverDelivered: (tn: string) =>
    `Estene: parcel ${tn} has been delivered. Thank you for using Estene.`,

  receiverFailed: (tn: string) =>
    `Estene: we couldn't deliver ${tn} today. Our rider will try again — reply or call us to reschedule.`,

  priceAdjusted: (tn: string, from: number, to: number, reason?: string) =>
    `Estene: the price for ${tn} changed from ${formatNaira(from)} to ${formatNaira(to)} after the rider checked your parcel${reason ? ` (${reason})` : ''}.`,
};
