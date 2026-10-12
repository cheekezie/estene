import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ADMIN_ROLES } from '@estene/contracts/enums';
import { ObjectIdSchema } from '@estene/contracts/common';
import { randomToken } from '../../lib/crypto';
import { conflict, notFound } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { toAdminProfile } from '../auth/auth.service';
import { AdminModel } from './models/admin.model';

const StaffBase = z.object({
  name: z.string().trim().min(2),
  email: z.email().trim().toLowerCase(),
  role: z.enum(ADMIN_ROLES),
  /** Required for office agents — they work one counter. */
  officeId: ObjectIdSchema.optional(),
});
const StaffInput = StaffBase.refine((s) => s.role !== 'office_agent' || !!s.officeId, {
  path: ['officeId'],
  message: 'Choose the office this agent works at',
});
const toStaffDoc = ({ officeId, ...rest }: { officeId?: string } & Record<string, unknown>) => ({
  ...rest,
  ...(officeId !== undefined && { office: officeId }),
});

/** Back-office staff accounts. Super admins only. */
export async function adminsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('super_admin'));

  app.get('/', async (_req, reply) => {
    const staff = await AdminModel.find().populate('office', 'name code').sort({ createdAt: -1 });
    return send(
      reply,
      staff.map((a) => ({
        ...toAdminProfile(a),
        isActive: a.isActive,
        lastLoginAt: a.lastLoginAt,
      })),
    );
  });

  app.post('/', async (req, reply) => {
    const input = parse(StaffInput, req.body);
    if (await AdminModel.exists({ email: input.email }))
      throw conflict('A staff member with this email exists');
    const tempPassword = randomToken(9).slice(0, 12);
    const admin = await AdminModel.create({
      ...toStaffDoc(input),
      passwordHash: await bcrypt.hash(tempPassword, 10),
    });
    await admin.populate('office', 'name code');
    return send(
      reply,
      { staff: toAdminProfile(admin), tempPassword },
      201,
      'Staff account created',
    );
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: ObjectIdSchema }), req.params);
    const input = parse(
      StaffBase.pick({ name: true, role: true, officeId: true })
        .partial()
        .extend({ isActive: z.boolean().optional() }),
      req.body,
    );
    const admin = await AdminModel.findByIdAndUpdate(id, toStaffDoc(input), { new: true }).populate(
      'office',
      'name code',
    );
    if (!admin) throw notFound('Staff member not found');
    return send(reply, toAdminProfile(admin), 200, 'Staff updated');
  });
}
