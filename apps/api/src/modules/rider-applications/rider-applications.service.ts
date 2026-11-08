import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Types } from 'mongoose';
import type { RiderInput } from '@estene/contracts/rider';
import {
  MAX_RIDER_DOCUMENT_BYTES,
  REQUIRED_RIDER_DOCUMENTS,
  RIDER_DOCUMENT_META,
  type RiderApplicationDto,
  type RiderApplicationData,
  type RiderApplicationStatus,
  type RiderApplicationSummaryDto,
  type RiderApplicationVettingInput,
  type RiderDocumentType,
} from '@estene/contracts/rider-application';
import { env } from '../../config/env';
import { randomCode } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { bus } from '../../lib/events';
import { assertR2, r2 } from '../../lib/r2';
import { paginate } from '../../lib/response';
import { AdminModel } from '../admins/models/admin.model';
import { OfficeModel } from '../offices/models/office.model';
import { RiderModel } from '../riders/models/rider.model';
import { RidersService } from '../riders/riders.service';
import { RiderApplicationModel, type IRiderApplication } from './models/rider-application.model';

const OPEN: RiderApplicationStatus[] = ['submitted', 'vetting'];
const VIEW_LINK_TTL_S = 5 * 60;

/** Checks the file really is what its Content-Type claims, from its first bytes. */
const SIGNATURES: Record<string, { ext: string; matches: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', matches: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  'image/jpeg': { ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/webp': {
    ext: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
};

type Populated<T> = T & { _id: Types.ObjectId };

function toDto(a: IRiderApplication): RiderApplicationDto {
  const zone = a.preferredZone as unknown as Populated<{ name: string }> | undefined;
  const office = a.vetting?.office as unknown as Populated<{ name: string }> | undefined;
  const rider = a.rider as unknown as Populated<{ code: string; type: 'company' | 'partner' }>;
  const have = new Set(a.documents.map((d) => d.type));
  return {
    id: a._id.toString(),
    reference: a.reference,
    status: a.status,
    kind: a.kind,
    firstName: a.firstName,
    lastName: a.lastName,
    phone: a.phone,
    email: a.email,
    area: a.area,
    preferredZone: zone?.name ? { id: zone._id.toString(), name: zone.name } : null,
    vehicleType: a.vehicleType,
    ownsVehicle: a.ownsVehicle,
    plateNumber: a.plateNumber,
    yearsRiding: a.yearsRiding,
    fleetName: a.fleetName,
    fleetSize: a.fleetSize,
    notes: a.notes,
    vetting:
      a.vetting && (a.vetting.at || a.vetting.office)
        ? {
            at: a.vetting.at?.toISOString(),
            office: office?.name ? { id: office._id.toString(), name: office.name } : null,
          }
        : null,
    documents: a.documents.map((d) => ({
      id: d._id.toString(),
      type: d.type,
      fileName: d.fileName,
      contentType: d.contentType,
      size: d.size,
      uploadedBy: d.uploadedByName ?? null,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    missingDocuments: REQUIRED_RIDER_DOCUMENTS.filter((t) => !have.has(t)),
    timeline: a.timeline.map((t) => ({
      at: t.at.toISOString(),
      by: t.byName ?? null,
      text: t.text,
    })),
    rejectionReason: a.rejectionReason,
    rider: rider?.code ? { id: rider._id.toString(), code: rider.code, type: rider.type } : null,
    createdAt: a.createdAt.toISOString(),
  };
}

async function load(id: string) {
  const a = await RiderApplicationModel.findById(id)
    .populate('preferredZone', 'name')
    .populate('vetting.office', 'name')
    .populate('rider', 'code type');
  if (!a) throw notFound('Application not found');
  return a;
}

async function adminName(adminId: string) {
  return (await AdminModel.findById(adminId, 'name').lean())?.name ?? 'Staff';
}

function assertOpen(a: IRiderApplication) {
  if (!OPEN.includes(a.status))
    throw conflict(`This application is already ${a.status}`, 'APPLICATION_CLOSED');
}

const lagosDate = (d: Date) =>
  d.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export const RiderApplicationsService = {
  /** From the public website. */
  async submit(input: RiderApplicationData) {
    if (await RiderModel.exists({ phone: input.phone }))
      throw conflict(
        'This phone number already belongs to an Estene rider. Sign in to the rider app instead.',
        'ALREADY_RIDER',
      );
    const open = await RiderApplicationModel.findOne(
      { phone: input.phone, status: { $in: OPEN } },
      'reference',
    ).lean();
    if (open)
      throw conflict(
        `You already applied (reference ${open.reference}). We’ll call you to arrange vetting.`,
        'ALREADY_APPLIED',
      );
    const { consent: _consent, preferredZoneId, ...rest } = input;
    const app = await RiderApplicationModel.create({
      ...rest,
      reference: `AP-${randomCode(6)}`,
      preferredZone: preferredZoneId,
      timeline: [{ text: 'Applied on the website' }],
    });
    bus.emit('rider_application.submitted', { applicationId: app.id });
    return { reference: app.reference };
  },

  async list(q: { page: number; limit: number; search?: string; status?: string }) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { reference: rx },
        { fleetName: rx },
      ];
    }
    const [rows, total, counts] = await Promise.all([
      RiderApplicationModel.find(filter)
        .populate('preferredZone', 'name')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      RiderApplicationModel.countDocuments(filter),
      RiderApplicationModel.aggregate<{ _id: RiderApplicationStatus; n: number }>([
        { $match: { status: { $in: OPEN } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);
    const items: RiderApplicationSummaryDto[] = rows.map((a) => {
      const d = toDto(a);
      return {
        id: d.id,
        reference: d.reference,
        status: d.status,
        kind: d.kind,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        area: d.area,
        vehicleType: d.vehicleType,
        preferredZone: d.preferredZone,
        createdAt: d.createdAt,
        documentCount: a.documents.length,
      };
    });
    return {
      ...paginate(items, total, q.page, q.limit),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) as Partial<
        Record<RiderApplicationStatus, number>
      >,
    };
  },

  async get(id: string) {
    return toDto(await load(id));
  },

  /** Invite the applicant in: sets/updates the vetting appointment. */
  async scheduleVetting(id: string, input: RiderApplicationVettingInput, adminId: string) {
    const a = await load(id);
    assertOpen(a);
    const office = input.officeId
      ? await OfficeModel.findById(input.officeId, 'name').lean()
      : null;
    if (input.officeId && !office) throw notFound('Office not found');
    a.status = 'vetting';
    a.vetting = { at: input.vettingAt, office: office?._id };
    const when = [input.vettingAt && lagosDate(input.vettingAt), office?.name]
      .filter(Boolean)
      .join(' at ');
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName: await adminName(adminId),
      text: `Invited for vetting${when ? `: ${when}` : ''}${input.note ? ` — ${input.note}` : ''}`,
    });
    await a.save();
    if (input.vettingAt || office)
      bus.emit('rider_application.vetting_scheduled', { applicationId: a.id });
    return this.get(id);
  },

  async addNote(id: string, note: string, adminId: string) {
    const a = await load(id);
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName: await adminName(adminId),
      text: note,
    });
    await a.save();
    return this.get(id);
  },

  /**
   * Ops scans or photographs a document the applicant brought and uploads it.
   * Stored in the private documents bucket; only ever opened through a
   * short-lived signed link.
   */
  async addDocument(
    id: string,
    meta: { type: RiderDocumentType; fileName: string; contentType: string | undefined },
    body: Buffer,
    adminId: string,
  ) {
    const bucket = env.R2_DOCUMENTS_BUCKET;
    assertR2(bucket, 'Document uploads');
    const a = await load(id);
    assertOpen(a);
    const sig = meta.contentType ? SIGNATURES[meta.contentType] : undefined;
    if (!sig) throw badRequest('Upload a PDF or a photo (JPEG, PNG or WebP)');
    if (body.length === 0 || body.length > MAX_RIDER_DOCUMENT_BYTES)
      throw badRequest('Files must be under 10 MB');
    if (!sig.matches(body)) throw badRequest('The file does not match its type');

    const key = `rider-applications/${a.id}/${randomUUID()}.${sig.ext}`;
    await r2().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: meta.contentType,
        ContentLength: body.length,
      }),
    );
    const byName = await adminName(adminId);
    a.documents.push({
      type: meta.type,
      key,
      fileName: meta.fileName,
      contentType: meta.contentType!,
      size: body.length,
      uploadedBy: adminId as unknown as Types.ObjectId,
      uploadedByName: byName,
      uploadedAt: new Date(),
    } as IRiderApplication['documents'][number]);
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName,
      text: `Uploaded ${RIDER_DOCUMENT_META[meta.type].label.split(' (')[0]}`,
    });
    await a.save();
    return this.get(id);
  },

  /** A 5-minute link to view one document. */
  async documentLink(id: string, docId: string) {
    const bucket = env.R2_DOCUMENTS_BUCKET;
    assertR2(bucket, 'Documents');
    const a = await RiderApplicationModel.findById(id, 'documents').lean();
    const doc = a?.documents.find((d) => d._id.toString() === docId);
    if (!doc) throw notFound('Document not found');
    const url = await getSignedUrl(
      r2(),
      new GetObjectCommand({
        Bucket: bucket,
        Key: doc.key,
        ResponseContentType: doc.contentType,
        ResponseContentDisposition: `inline; filename="${doc.fileName.replace(/[^\w.-]+/g, '_')}"`,
      }),
      { expiresIn: VIEW_LINK_TTL_S },
    );
    return { url, expiresAt: new Date(Date.now() + VIEW_LINK_TTL_S * 1000).toISOString() };
  },

  /** Removes a wrong upload. Only while the application is still open. */
  async removeDocument(id: string, docId: string, adminId: string) {
    const bucket = env.R2_DOCUMENTS_BUCKET;
    assertR2(bucket, 'Documents');
    const a = await load(id);
    assertOpen(a);
    const doc = a.documents.find((d) => d._id.toString() === docId);
    if (!doc) throw notFound('Document not found');
    await r2().send(new DeleteObjectCommand({ Bucket: bucket, Key: doc.key }));
    a.documents = a.documents.filter((d) => d._id.toString() !== docId);
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName: await adminName(adminId),
      text: `Removed ${doc.fileName}`,
    });
    await a.save();
    return this.get(id);
  },

  /**
   * After physical vetting: creates the rider (active straight away — they've
   * been vetted) and hands back the one-time password for ops to give them.
   */
  async approve(id: string, input: RiderInput, adminId: string) {
    const a = await load(id);
    assertOpen(a);
    const missing = REQUIRED_RIDER_DOCUMENTS.filter((t) => !a.documents.some((d) => d.type === t));
    if (missing.length)
      throw badRequest(
        `Upload these first: ${missing.map((t) => RIDER_DOCUMENT_META[t].label.split(' (')[0]).join(', ')}`,
        'DOCUMENTS_MISSING',
      );
    const created = await RidersService.create(input, adminId);
    const rider = await RidersService.setStatus(created.rider.id, 'active');
    a.status = 'approved';
    a.rider = rider.id as unknown as Types.ObjectId;
    a.reviewedBy = adminId as unknown as Types.ObjectId;
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName: await adminName(adminId),
      text: `Approved — rider ${rider.code} created`,
    });
    await a.save();
    bus.emit('rider_application.approved', { applicationId: a.id, riderId: rider.id });
    return { application: await this.get(id), rider, tempPassword: created.tempPassword };
  },

  async reject(id: string, reason: string, adminId: string) {
    const a = await load(id);
    assertOpen(a);
    a.status = 'rejected';
    a.rejectionReason = reason;
    a.reviewedBy = adminId as unknown as Types.ObjectId;
    a.timeline.push({
      at: new Date(),
      by: adminId as unknown as Types.ObjectId,
      byName: await adminName(adminId),
      text: `Rejected — ${reason}`,
    });
    await a.save();
    return this.get(id);
  },

  /** For the vetting SMS. */
  async smsDetails(id: string) {
    const a = await RiderApplicationModel.findById(id, 'reference phone firstName vetting')
      .populate<{ vetting: { at?: Date; office?: { name: string; address: string } } }>(
        'vetting.office',
        'name address',
      )
      .lean();
    if (!a) return null;
    return {
      reference: a.reference,
      phone: a.phone,
      firstName: a.firstName,
      when: a.vetting?.at ? lagosDate(a.vetting.at) : undefined,
      office: a.vetting?.office,
    };
  },
};
