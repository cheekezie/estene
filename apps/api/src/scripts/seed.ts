/**
 * Idempotent dev seed: super admin, Abuja launch zones, pricing, sample
 * route fares, two riders (one company, one partner) and a batch of tags.
 *   pnpm seed
 */
import bcrypt from 'bcryptjs';
import { DEFAULT_PRICING_CONFIG } from '@estene/contracts/pricing';
import { env } from '../config/env';
import { connectDB, disconnectDB } from '../lib/db';
import { redis } from '../lib/redis';
import { AdminModel } from '../modules/admins/models/admin.model';
import { PricingConfigModel } from '../modules/pricing/models/pricing-config.model';
import { orderedPair, RouteRateModel } from '../modules/pricing/models/route-rate.model';
import { RiderModel } from '../modules/riders/models/rider.model';
import { ParcelTagModel } from '../modules/tags/models/parcel-tag.model';
import { TagsService } from '../modules/tags/tags.service';
import { ZoneModel } from '../modules/zones/models/zone.model';

const ZONES = [
  { code: 'GRK', name: 'Garki & CBD', center: [7.4891, 9.0333], radiusKm: 4, fare: 150_000, areas: ['Garki I', 'Garki II', 'Area 1', 'Area 3', 'Area 10', 'Central Business District'] },
  { code: 'WSE', name: 'Wuse', center: [7.48, 9.07], radiusKm: 3.5, fare: 150_000, areas: ['Wuse I', 'Wuse II', 'Zone 4', 'Zone 6', 'Berger'] },
  { code: 'MTA', name: 'Maitama & Asokoro', center: [7.499, 9.088], radiusKm: 5, fare: 180_000, areas: ['Maitama', 'Asokoro', 'Three Arms Zone', 'Guzape'] },
  { code: 'JBI', name: 'Jabi & Utako', center: [7.428, 9.072], radiusKm: 4, fare: 150_000, areas: ['Jabi', 'Utako', 'Wuye', 'Life Camp', 'Mabushi'] },
  { code: 'GWA', name: 'Gwarinpa & Kado', center: [7.4, 9.11], radiusKm: 5, fare: 150_000, areas: ['Gwarinpa', 'Kado', 'Dawaki', 'Katampe'] },
  { code: 'APO', name: 'Apo & Lokogoma', center: [7.49, 8.98], radiusKm: 5, fare: 150_000, areas: ['Apo', 'Lokogoma', 'Galadimawa', 'Gudu', 'Durumi'] },
  { code: 'LGB', name: 'Lugbe & Airport Road', center: [7.38, 8.98], radiusKm: 6, fare: 180_000, areas: ['Lugbe', 'Kyami', 'Pyakasa', 'Airport Road'] },
  { code: 'KBW', name: 'Kubwa & Dutse', center: [7.33, 9.15], radiusKm: 6, fare: 180_000, areas: ['Kubwa', 'Dutse', 'Byazhin', 'Bwari Road'] },
  { code: 'NYN', name: 'Nyanya & Karu', center: [7.57, 9.01], radiusKm: 6, fare: 180_000, areas: ['Nyanya', 'Karu', 'Mararaba', 'Jikwoyi'] },
] as const;

/** Sample fares between neighbouring zones; everything else falls back to the default route fare. */
const ROUTES: [string, string, number][] = [
  ['GRK', 'WSE', 200_000], ['GRK', 'MTA', 220_000], ['WSE', 'MTA', 200_000], ['WSE', 'JBI', 220_000],
  ['JBI', 'GWA', 220_000], ['GRK', 'APO', 250_000], ['APO', 'LGB', 280_000], ['GWA', 'KBW', 300_000],
  ['GRK', 'NYN', 300_000], ['GRK', 'LGB', 350_000], ['GRK', 'KBW', 400_000],
];

async function seed() {
  await connectDB();

  const email = env.SEED_ADMIN_EMAIL ?? 'admin@estene.ng';
  if (!(await AdminModel.exists({ email }))) {
    await AdminModel.create({ name: 'Estene Admin', email, role: 'super_admin', passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 10) });
    console.log(`✓ super admin ${email}`);
  }

  const zoneIds: Record<string, string> = {};
  for (const z of ZONES) {
    const doc = await ZoneModel.findOneAndUpdate(
      { code: z.code },
      { name: z.name, code: z.code, city: 'Abuja', areas: z.areas, center: { type: 'Point', coordinates: z.center }, radiusKm: z.radiusKm, intraZoneFare: z.fare, isActive: true },
      { upsert: true, new: true },
    );
    zoneIds[z.code] = doc.id;
  }
  console.log(`✓ ${ZONES.length} zones`);

  await PricingConfigModel.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default', ...DEFAULT_PRICING_CONFIG } }, { upsert: true });
  for (const [a, b, fare] of ROUTES) {
    await RouteRateModel.updateOne(orderedPair(zoneIds[a]!, zoneIds[b]!), { fare }, { upsert: true });
  }
  console.log(`✓ pricing + ${ROUTES.length} route fares`);

  const passwordHash = await bcrypt.hash('rider1234', 10);
  const riders = [
    { code: 'RD-DEMO01', firstName: 'Musa', lastName: 'Ibrahim', phone: '+2348030000001', type: 'company', vehicleType: 'bike', primaryZone: zoneIds.WSE, coverageZones: [zoneIds.WSE, zoneIds.GRK, zoneIds.MTA] },
    { code: 'RD-DEMO02', firstName: 'Chidi', lastName: 'Okafor', phone: '+2348030000002', type: 'partner', vehicleType: 'bike', fleetName: 'Swift Riders Ltd', commissionPct: 20, primaryZone: zoneIds.GRK, coverageZones: [zoneIds.GRK, zoneIds.APO] },
  ];
  for (const r of riders) {
    await RiderModel.updateOne({ phone: r.phone }, { $setOnInsert: { ...r, status: 'active', passwordHash } }, { upsert: true });
  }
  console.log('✓ demo riders (password: rider1234)');

  if ((await ParcelTagModel.countDocuments({ status: 'available' })) < 20) {
    const { batch } = await TagsService.generateBatch(50);
    console.log(`✓ 50 parcel tags (batch ${batch})`);
  }

  await disconnectDB();
  redis.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
