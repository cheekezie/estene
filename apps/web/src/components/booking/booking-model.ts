import { z } from 'zod';
import { CreateShipmentSchema, type CreateShipmentInput } from '@estene/contracts/shipment';
import type { ParcelSize, PaymentMethod, ServiceLevel } from '@estene/contracts/enums';
import { nairaToKobo } from '@estene/contracts/money';

/** Flat, string-friendly form state. Converted to the API contract only on submit. */
export type BookingDraft = {
  pickupSlot: string; // "<zoneId>|<area>"
  dropoffSlot: string;
  size: ParcelSize;
  weightKg: string;
  serviceLevel: ServiceLevel;
  fragile: boolean;
  declaredValueNaira: string;
  description: string;
  senderName: string;
  senderPhone: string;
  pickupAddress: string;
  pickupLandmark: string;
  recipientName: string;
  recipientPhone: string;
  dropoffAddress: string;
  dropoffLandmark: string;
  senderEmail: string;
  notes: string;
  paymentMethod: PaymentMethod;
};

export const EMPTY_DRAFT: BookingDraft = {
  pickupSlot: '',
  dropoffSlot: '',
  size: 'small',
  weightKg: '1',
  serviceLevel: 'standard',
  fragile: false,
  declaredValueNaira: '',
  description: '',
  senderName: '',
  senderPhone: '',
  pickupAddress: '',
  pickupLandmark: '',
  recipientName: '',
  recipientPhone: '',
  dropoffAddress: '',
  dropoffLandmark: '',
  senderEmail: '',
  notes: '',
  paymentMethod: 'cash_on_pickup',
};

export const splitSlot = (slot: string) => {
  const [zoneId = '', area = ''] = slot.split('|');
  return { zoneId, area };
};

const opt = (v: string) => v.trim() || undefined;

export function toShipmentInput(d: BookingDraft): unknown {
  const pickup = splitSlot(d.pickupSlot);
  const dropoff = splitSlot(d.dropoffSlot);
  return {
    pickup: {
      contactName: d.senderName,
      phone: d.senderPhone,
      zoneId: pickup.zoneId,
      area: pickup.area,
      address: d.pickupAddress,
      landmark: opt(d.pickupLandmark),
    },
    dropoff: {
      contactName: d.recipientName,
      phone: d.recipientPhone,
      zoneId: dropoff.zoneId,
      area: dropoff.area,
      address: d.dropoffAddress,
      landmark: opt(d.dropoffLandmark),
    },
    parcel: {
      size: d.size,
      weightKg: Number(d.weightKg),
      description: d.description,
      fragile: d.fragile,
      declaredValue: d.declaredValueNaira ? nairaToKobo(Number(d.declaredValueNaira)) : 0,
    },
    serviceLevel: d.serviceLevel,
    paymentMethod: d.paymentMethod,
    senderEmail: opt(d.senderEmail),
    notes: opt(d.notes),
  };
}

/** Maps contract error paths back onto the draft field the user typed into. */
const PATH_TO_FIELD: Record<string, keyof BookingDraft> = {
  'pickup.zoneId': 'pickupSlot',
  'pickup.area': 'pickupSlot',
  'dropoff.zoneId': 'dropoffSlot',
  'dropoff.area': 'dropoffSlot',
  'parcel.weightKg': 'weightKg',
  'parcel.description': 'description',
  'parcel.declaredValue': 'declaredValueNaira',
  'pickup.contactName': 'senderName',
  'pickup.phone': 'senderPhone',
  'pickup.address': 'pickupAddress',
  'pickup.landmark': 'pickupLandmark',
  'dropoff.contactName': 'recipientName',
  'dropoff.phone': 'recipientPhone',
  'dropoff.address': 'dropoffAddress',
  'dropoff.landmark': 'dropoffLandmark',
  senderEmail: 'senderEmail',
  notes: 'notes',
};

export type FieldErrors = Partial<Record<keyof BookingDraft, string>>;

const FRIENDLY: Partial<Record<keyof BookingDraft, string>> = {
  pickupSlot: 'Choose a pickup area',
  dropoffSlot: 'Choose a drop-off area',
  weightKg: 'Enter a weight in kg',
  description: 'Tell us what is in the parcel',
  senderName: 'Enter your name',
  recipientName: "Enter the recipient's name",
  pickupAddress: 'Enter the pickup address',
  dropoffAddress: 'Enter the drop-off address',
};

export function validate(
  draft: BookingDraft,
  fields: (keyof BookingDraft)[],
): { errors: FieldErrors; data?: CreateShipmentInput } {
  const result = CreateShipmentSchema.safeParse(toShipmentInput(draft));
  const errors: FieldErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues as z.core.$ZodIssue[]) {
      const field = PATH_TO_FIELD[issue.path.join('.')];
      if (field && fields.includes(field) && !errors[field]) {
        errors[field] =
          issue.code === 'invalid_type' || issue.code === 'too_small'
            ? (FRIENDLY[field] ?? issue.message)
            : issue.message;
      }
    }
  }
  return { errors, data: result.success ? result.data : undefined };
}

export const STEP_FIELDS: (keyof BookingDraft)[][] = [
  ['pickupSlot', 'dropoffSlot', 'weightKg', 'description', 'declaredValueNaira'],
  [
    'senderName',
    'senderPhone',
    'pickupAddress',
    'pickupLandmark',
    'recipientName',
    'recipientPhone',
    'dropoffAddress',
    'dropoffLandmark',
    'senderEmail',
    'notes',
  ],
  [],
];
