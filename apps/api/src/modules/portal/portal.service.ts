import bcrypt from 'bcryptjs';
import { Types, type FilterQuery } from 'mongoose';
import type { ShipmentStatus } from '@estene/contracts/enums';
import {
  STATEMENT_ENTRY_TYPES,
  type ClientUserProfile,
  type PortalChangePasswordInput,
  type PortalOverviewDto,
  type PortalUserCreateInput,
  type PortalUserCredentialsDto,
  type PortalUserDto,
  type StatementEntryDto,
  type StatementEntryType,
} from '@estene/contracts/portal';
import { randomCode } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { badRequest, conflict, notFound, unauthorized } from '../../lib/errors';
import { paginate } from '../../lib/response';
import { SessionModel } from '../auth/models/session.model';
import { ClientModel } from '../clients/models/client.model';
import { FinanceService } from '../finance/finance.service';
import { LedgerEntryModel } from '../finance/models/ledger-entry.model';
import { toIntegrationShipmentDto } from '../integration/integration.mapper';
import { ShipmentModel, type IShipment } from '../shipments/models/shipment.model';
import { SHIPMENT_POPULATE } from '../shipments/shipments.mapper';
import { WarehousingService } from '../warehousing/warehousing.service';
import { ClientUserModel, type IClientUser } from './models/client-user.model';

const FINISHED: ShipmentStatus[] = ['delivered', 'collected', 'returned', 'cancelled'];

/** e.g. "7KQ2-M9XA-3TPW" — Crockford alphabet, easy to read out over the phone. */
const temporaryPassword = () => [randomCode(4), randomCode(4), randomCode(4)].join('-');

const toUserDto = (u: IClientUser): PortalUserDto => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

const revokeSessions = (userId: Types.ObjectId | string) =>
  SessionModel.updateMany(
    { actor: 'client', subject: userId, revokedAt: null },
    { revokedAt: new Date() },
  );

async function loadUser(clientId: string, userId: string) {
  const user = await ClientUserModel.findOne({ _id: userId, client: clientId });
  if (!user) throw notFound('Portal user not found');
  return user;
}

export const PortalService = {
  // ── Session ───────────────────────────────────────────────────────────────

  async profile(userId: string): Promise<ClientUserProfile> {
    const user = await ClientUserModel.findById(userId).lean();
    if (!user) throw unauthorized();
    const client = await ClientModel.findById(user.client, 'name warehousing.enabled').lean();
    if (!client) throw unauthorized();
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      client: {
        id: client._id.toString(),
        name: client.name,
        warehousing: !!client.warehousing?.enabled,
      },
    };
  },

  /** Every portal request re-checks the user and the business: a suspension takes effect at once. */
  async assertActive(userId: string, clientId: string) {
    const [user, client] = await Promise.all([
      ClientUserModel.exists({ _id: userId, client: clientId, isActive: true }),
      ClientModel.exists({ _id: clientId, status: 'active' }),
    ]);
    if (!user || !client) throw unauthorized('Your access has been switched off');
  },

  async changePassword(userId: string, input: PortalChangePasswordInput) {
    const user = await ClientUserModel.findById(userId).select('+passwordHash');
    if (!user) throw unauthorized();
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash)))
      throw badRequest('Your current password is not right', 'WRONG_PASSWORD');
    if (input.currentPassword === input.newPassword)
      throw badRequest('Choose a password different from the current one');
    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    return this.profile(userId);
  },

  // ── Staff: managing a client's users ──────────────────────────────────────

  async listUsers(clientId: string) {
    const rows = await ClientUserModel.find({ client: clientId }).sort({ createdAt: 1 }).lean();
    return rows.map(toUserDto);
  },

  async createUser(
    clientId: string,
    input: PortalUserCreateInput,
    adminId: string,
  ): Promise<PortalUserCredentialsDto> {
    if (!(await ClientModel.exists({ _id: clientId }))) throw notFound('Client not found');
    const password = temporaryPassword();
    try {
      const user = await ClientUserModel.create({
        client: clientId,
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(password, 12),
        createdBy: adminId,
      });
      return { user: toUserDto(user), temporaryPassword: password };
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw conflict('Someone already signs in with this email', 'DUPLICATE_EMAIL');
      throw err;
    }
  },

  /** Issues a new temporary password and signs the user out everywhere. */
  async resetPassword(clientId: string, userId: string): Promise<PortalUserCredentialsDto> {
    const user = await loadUser(clientId, userId);
    const password = temporaryPassword();
    user.passwordHash = await bcrypt.hash(password, 12);
    user.mustChangePassword = true;
    await user.save();
    await revokeSessions(user._id);
    return { user: toUserDto(user), temporaryPassword: password };
  },

  async setActive(clientId: string, userId: string, isActive: boolean) {
    const user = await loadUser(clientId, userId);
    user.isActive = isActive;
    await user.save();
    if (!isActive) await revokeSessions(user._id);
    return toUserDto(user);
  },

  // ── Portal views ──────────────────────────────────────────────────────────

  async overview(clientId: string): Promise<PortalOverviewDto> {
    const client = await ClientModel.findById(clientId, 'warehousing.enabled').lean();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [warehouse, active, deliveredThisMonth, outstanding] = await Promise.all([
      client?.warehousing?.enabled ? WarehousingService.summary(clientId) : null,
      ShipmentModel.countDocuments({ client: clientId, status: { $nin: FINISHED } }),
      ShipmentModel.countDocuments({
        client: clientId,
        status: { $in: ['delivered', 'collected'] },
        updatedAt: { $gte: monthStart },
      }),
      FinanceService.clientOutstanding(clientId),
    ]);
    return { warehouse, shipments: { active, deliveredThisMonth }, outstanding };
  },

  /** The client's shipments in the integration shape: no PINs, no rider phone numbers. */
  async shipments(
    clientId: string,
    q: { page: number; limit: number; status?: ShipmentStatus; search?: string },
  ) {
    const filter: FilterQuery<IShipment> = { client: clientId };
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [
        { trackingNumber: rx },
        { clientReference: rx },
        { 'dropoff.contactName': rx },
        { 'dropoff.phone': rx },
      ];
    }
    const [rows, total] = await Promise.all([
      ShipmentModel.find(filter)
        .populate(SHIPMENT_POPULATE)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      ShipmentModel.countDocuments(filter),
    ]);
    return paginate(rows.map(toIntegrationShipmentDto), total, q.page, q.limit);
  },

  async shipment(clientId: string, ref: string) {
    const or: FilterQuery<IShipment>[] = [
      { trackingNumber: ref.toUpperCase() },
      { clientReference: ref },
    ];
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    const s = await ShipmentModel.findOne({ client: clientId, $or: or }).populate(
      SHIPMENT_POPULATE,
    );
    if (!s) throw notFound('Shipment not found');
    return toIntegrationShipmentDto(s);
  },

  /** What the client has been charged and has paid, newest first, with the running balance. */
  async statement(clientId: string, q: { page: number; limit: number }) {
    const filter = {
      client: new Types.ObjectId(clientId),
      type: { $in: [...STATEMENT_ENTRY_TYPES] },
    };
    const [rows, total, outstanding] = await Promise.all([
      LedgerEntryModel.find(filter)
        .populate<{ shipment: { trackingNumber: string } | null }>('shipment', 'trackingNumber')
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      LedgerEntryModel.countDocuments(filter),
      FinanceService.clientOutstanding(clientId),
    ]);
    const items: StatementEntryDto[] = rows.map((e) => ({
      id: e._id.toString(),
      type: e.type as StatementEntryType,
      amount: e.amount,
      reference: e.reference ?? null,
      note: e.note ?? null,
      trackingNumber: e.shipment?.trackingNumber ?? null,
      at: e.createdAt.toISOString(),
    }));
    return { outstanding, entries: paginate(items, total, q.page, q.limit) };
  },
};
