import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { ActorType, AdminRole } from '@estene/contracts/enums';
import type { AdminLoginInput, AdminProfile, RiderLoginInput } from '@estene/contracts/auth';
import type { ClientLoginInput } from '@estene/contracts/portal';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../lib/crypto';
import { unauthorized } from '../../lib/errors';
import { AdminModel, type IAdmin } from '../admins/models/admin.model';
import { ClientModel } from '../clients/models/client.model';
import { ClientUserModel } from '../portal/models/client-user.model';
import { PortalService } from '../portal/portal.service';
import { RiderModel } from '../riders/models/rider.model';
import { SessionModel } from './models/session.model';

type ClientMeta = { ip?: string; userAgent?: string };
type Subject = {
  id: string;
  actor: ActorType;
  role?: AdminRole;
  officeId?: string;
  clientId?: string;
};

// Same cost whether or not the account exists, so login timing doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export const toAdminProfile = (a: IAdmin): AdminProfile => {
  const office = a.office as unknown as
    { _id: { toString(): string }; name: string; code: string } | null | undefined;
  return {
    id: a._id.toString(),
    name: a.name,
    email: a.email,
    role: a.role,
    office:
      office && 'code' in office
        ? { id: office._id.toString(), name: office.name, code: office.code }
        : null,
  };
};

export function createAuthService(app: FastifyInstance) {
  async function issueTokens(subject: Subject, meta: ClientMeta, family = randomToken(12)) {
    const accessToken = app.jwt.sign({
      sub: subject.id,
      actor: subject.actor,
      role: subject.role,
      officeId: subject.officeId,
      clientId: subject.clientId,
    });
    const refreshToken = randomToken();
    await SessionModel.create({
      actor: subject.actor,
      subject: subject.id,
      tokenHash: sha256(refreshToken),
      family,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    });
    return { accessToken, refreshToken };
  }

  return {
    async adminLogin(input: AdminLoginInput, meta: ClientMeta) {
      const admin = await AdminModel.findOne({ email: input.email, isActive: true })
        .select('+passwordHash')
        .populate('office', 'name code');
      const valid = await bcrypt.compare(input.password, admin?.passwordHash ?? DUMMY_HASH);
      if (!admin || !valid) throw unauthorized('Incorrect email or password');

      admin.lastLoginAt = new Date();
      await admin.save();
      const tokens = await issueTokens(
        { id: admin.id, actor: 'admin', role: admin.role, officeId: admin.office?._id?.toString() },
        meta,
      );
      return { ...tokens, user: toAdminProfile(admin) };
    },

    async riderLogin(input: RiderLoginInput, meta: ClientMeta) {
      const rider = await RiderModel.findOne({ phone: input.phone }).select('+passwordHash');
      const valid = await bcrypt.compare(input.password, rider?.passwordHash ?? DUMMY_HASH);
      if (!rider || !valid) throw unauthorized('Incorrect phone number or password');
      if (rider.status !== 'active')
        throw unauthorized('Your account is not active. Contact operations.');

      const tokens = await issueTokens({ id: rider.id, actor: 'rider' }, meta);
      return {
        ...tokens,
        user: { id: rider.id, name: `${rider.firstName} ${rider.lastName}`, code: rider.code },
      };
    },

    /** Client portal sign-in. A suspended business locks out all of its users. */
    async clientLogin(input: ClientLoginInput, meta: ClientMeta) {
      const user = await ClientUserModel.findOne({ email: input.email, isActive: true }).select(
        '+passwordHash',
      );
      const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !valid) throw unauthorized('Incorrect email or password');
      const client = await ClientModel.findById(user.client, 'status').lean();
      if (client?.status !== 'active')
        throw unauthorized('This business account is not active. Contact Estene.');

      user.lastLoginAt = new Date();
      await user.save();
      const tokens = await issueTokens(
        { id: user.id, actor: 'client', clientId: user.client.toString() },
        meta,
      );
      return { ...tokens, user: await PortalService.profile(user.id) };
    },

    /** Rotates the refresh token. Reuse of a rotated token revokes the whole family. */
    async refresh(refreshToken: string, meta: ClientMeta, only?: ActorType) {
      const session = await SessionModel.findOne({ tokenHash: sha256(refreshToken) });
      if (!session || session.expiresAt < new Date()) throw unauthorized('Session expired');
      if (only && session.actor !== only) throw unauthorized('Session expired');

      if (session.revokedAt) {
        await SessionModel.updateMany({ family: session.family }, { revokedAt: new Date() });
        throw unauthorized('Session expired');
      }

      let role: AdminRole | undefined;
      let officeId: string | undefined;
      if (session.actor === 'admin') {
        const admin = await AdminModel.findOne({ _id: session.subject, isActive: true });
        if (!admin) throw unauthorized('Session expired');
        role = admin.role;
        officeId = admin.office?.toString();
      }
      let clientId: string | undefined;
      if (session.actor === 'client') {
        const user = await ClientUserModel.findOne({ _id: session.subject, isActive: true }).lean();
        const client = user && (await ClientModel.findById(user.client, 'status').lean());
        if (!user || client?.status !== 'active') throw unauthorized('Session expired');
        clientId = user.client.toString();
      }

      const tokens = await issueTokens(
        { id: session.subject.toString(), actor: session.actor, role, officeId, clientId },
        meta,
        session.family,
      );
      session.revokedAt = new Date();
      session.replacedBy = sha256(tokens.refreshToken);
      await session.save();
      return tokens;
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) return;
      const session = await SessionModel.findOne({ tokenHash: sha256(refreshToken) });
      if (session)
        await SessionModel.updateMany({ family: session.family }, { revokedAt: new Date() });
    },

    async adminProfile(adminId: string) {
      const admin = await AdminModel.findById(adminId).populate('office', 'name code');
      if (!admin || !admin.isActive) throw unauthorized();
      return toAdminProfile(admin);
    },
  };
}
