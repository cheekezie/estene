/**
 * Creates the first super admin on a fresh database (the demo seed is for local
 * work only). Safe to re-run: an existing email is left untouched.
 *
 *   Local:      pnpm --filter @estene/api create-admin -- --email you@estene.ng --name "Your Name"
 *   Container:  node dist/create-admin.js --email you@estene.ng --name "Your Name"
 *
 * The password comes from ADMIN_PASSWORD, or one is generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../lib/db';
import { redis } from '../lib/redis';
import { AdminModel } from '../modules/admins/models/admin.model';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = (arg('name') ?? process.env.ADMIN_NAME ?? 'Estene Admin').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error('Pass --email you@example.com (or set ADMIN_EMAIL)');

  const given = process.env.ADMIN_PASSWORD;
  if (given && given.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  const password = given ?? randomBytes(12).toString('base64url');

  await connectDB();
  try {
    if (await AdminModel.exists({ email })) {
      console.log(`An admin with ${email} already exists — nothing changed.`);
      return;
    }
    await AdminModel.create({
      name,
      email,
      role: 'super_admin',
      passwordHash: await bcrypt.hash(password, 12),
    });
    console.log(`✓ super admin ${email}`);
    if (!given)
      console.log(`  temporary password: ${password}  (shown once — change it after signing in)`);
  } finally {
    await disconnectDB();
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
