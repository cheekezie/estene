/**
 * Idempotent dev seed: super admin, Abuja launch zones, pricing, sample
 * route fares, two riders (one company, one partner), a batch of tags and a
 * warehousing client with stock at the Wuse office.
 *   pnpm seed
 */
import bcrypt from 'bcryptjs';
import { ClientUserModel } from '../modules/portal/models/client-user.model';
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
import { OfficeModel } from '../modules/offices/models/office.model';
import { ClientModel } from '../modules/clients/models/client.model';
import { ProductModel } from '../modules/warehousing/models/product.model';
import { StockLevelModel } from '../modules/warehousing/models/stock-level.model';
import { StockService } from '../modules/warehousing/stock.service';

const ZONES = [
  {
    code: 'GRK',
    name: 'Garki & CBD',
    center: [7.4891, 9.0333],
    radiusKm: 4,
    fare: 150_000,
    areas: ['Garki I', 'Garki II', 'Area 1', 'Area 3', 'Area 10', 'Central Business District'],
  },
  {
    code: 'WSE',
    name: 'Wuse',
    center: [7.48, 9.07],
    radiusKm: 3.5,
    fare: 150_000,
    areas: ['Wuse I', 'Wuse II', 'Zone 4', 'Zone 6', 'Berger'],
  },
  {
    code: 'MTA',
    name: 'Maitama & Asokoro',
    center: [7.499, 9.088],
    radiusKm: 5,
    fare: 180_000,
    areas: ['Maitama', 'Asokoro', 'Three Arms Zone', 'Guzape'],
  },
  {
    code: 'JBI',
    name: 'Jabi & Utako',
    center: [7.428, 9.072],
    radiusKm: 4,
    fare: 150_000,
    areas: ['Jabi', 'Utako', 'Wuye', 'Life Camp', 'Mabushi'],
  },
  {
    code: 'GWA',
    name: 'Gwarinpa & Kado',
    center: [7.4, 9.11],
    radiusKm: 5,
    fare: 150_000,
    areas: ['Gwarinpa', 'Kado', 'Dawaki', 'Katampe'],
  },
  {
    code: 'APO',
    name: 'Apo & Lokogoma',
    center: [7.49, 8.98],
    radiusKm: 5,
    fare: 150_000,
    areas: ['Apo', 'Lokogoma', 'Galadimawa', 'Gudu', 'Durumi'],
  },
  {
    code: 'LGB',
    name: 'Lugbe & Airport Road',
    center: [7.38, 8.98],
    radiusKm: 6,
    fare: 180_000,
    areas: ['Lugbe', 'Kyami', 'Pyakasa', 'Airport Road'],
  },
  {
    code: 'KBW',
    name: 'Kubwa & Dutse',
    center: [7.33, 9.15],
    radiusKm: 6,
    fare: 180_000,
    areas: ['Kubwa', 'Dutse', 'Byazhin', 'Bwari Road'],
  },
  {
    code: 'NYN',
    name: 'Nyanya & Karu',
    center: [7.57, 9.01],
    radiusKm: 6,
    fare: 180_000,
    areas: ['Nyanya', 'Karu', 'Mararaba', 'Jikwoyi'],
  },
] as const;

/** Lagos — launches with the interstate network; reached from Abuja via office-to-office manifests. */
const LAGOS_ZONES = [
  {
    code: 'IKJ',
    name: 'Ikeja',
    center: [3.3515, 6.6018],
    radiusKm: 6,
    fare: 200_000,
    areas: ['Ikeja GRA', 'Allen Avenue', 'Alausa', 'Maryland', 'Ogba'],
  },
  {
    code: 'LKI',
    name: 'Lekki & VI',
    center: [3.4726, 6.4474],
    radiusKm: 8,
    fare: 250_000,
    areas: ['Victoria Island', 'Lekki Phase 1', 'Ikoyi', 'Oniru', 'Chevron'],
  },
  {
    code: 'YAB',
    name: 'Yaba & Surulere',
    center: [3.3711, 6.5095],
    radiusKm: 5,
    fare: 200_000,
    areas: ['Yaba', 'Surulere', 'Ebute Metta', 'Akoka'],
  },
] as const;

/** Offices: drop-off, consolidation and collection points. */
const OFFICES = [
  {
    code: 'ABJ-WSE',
    name: 'Wuse Office',
    zone: 'WSE',
    area: 'Wuse II',
    address: 'Plot 1120 Aminu Kano Crescent, Wuse II',
    phone: '+2348090000101',
    location: { lng: 7.4795, lat: 9.0763 },
  },
  {
    code: 'ABJ-GRK',
    name: 'Garki Office',
    zone: 'GRK',
    area: 'Garki II',
    address: '14 Ahmadu Bello Way, Garki II',
    phone: '+2348090000102',
    location: { lng: 7.4917, lat: 9.0349 },
  },
  {
    code: 'LOS-IKJ',
    name: 'Ikeja Office',
    zone: 'IKJ',
    area: 'Allen Avenue',
    address: '22 Allen Avenue, Ikeja',
    phone: '+2348090000201',
    location: { lng: 3.3532, lat: 6.6033 },
  },
] as const;

/** Sample fares between neighbouring zones; everything else falls back to the default route fare. */
const ROUTES: [string, string, number][] = [
  ['GRK', 'WSE', 200_000],
  ['GRK', 'MTA', 220_000],
  ['WSE', 'MTA', 200_000],
  ['WSE', 'JBI', 220_000],
  ['JBI', 'GWA', 220_000],
  ['GRK', 'APO', 250_000],
  ['APO', 'LGB', 280_000],
  ['GWA', 'KBW', 300_000],
  ['GRK', 'NYN', 300_000],
  ['GRK', 'LGB', 350_000],
  ['GRK', 'KBW', 400_000],
  // Interstate: an explicit Abuja ↔ Lagos lane; other interstate pairs use the default interstate fare.
  ['WSE', 'IKJ', 550_000],
];

async function seed() {
  // Demo riders and logins with known passwords must never reach a live database.
  if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production'))
    throw new Error('Refusing to seed demo data in production. Use create-admin instead.');
  await connectDB();

  const email = env.SEED_ADMIN_EMAIL ?? 'admin@estene.ng';
  if (!(await AdminModel.exists({ email }))) {
    await AdminModel.create({
      name: 'Estene Admin',
      email,
      role: 'super_admin',
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 10),
    });
    console.log(`✓ super admin ${email}`);
  }

  const zoneIds: Record<string, string> = {};
  const allZones = [
    ...ZONES.map((z) => ({ ...z, city: 'Abuja', state: 'FCT' })),
    ...LAGOS_ZONES.map((z) => ({ ...z, city: 'Lagos', state: 'Lagos' })),
  ];
  for (const z of allZones) {
    const doc = await ZoneModel.findOneAndUpdate(
      { code: z.code },
      {
        name: z.name,
        code: z.code,
        city: z.city,
        state: z.state,
        areas: z.areas,
        center: { type: 'Point', coordinates: z.center },
        radiusKm: z.radiusKm,
        intraZoneFare: z.fare,
        isActive: true,
      },
      { upsert: true, new: true },
    );
    zoneIds[z.code] = doc.id;
  }
  console.log(`✓ ${allZones.length} zones (Abuja + Lagos)`);

  const officeIds: Record<string, string> = {};
  for (const o of OFFICES) {
    const doc = await OfficeModel.findOneAndUpdate(
      { code: o.code },
      {
        name: o.name,
        code: o.code,
        zone: zoneIds[o.zone],
        area: o.area,
        address: o.address,
        phone: o.phone,
        location: { type: 'Point', coordinates: [o.location.lng, o.location.lat] },
        isActive: true,
        // Wuse doubles as the Abuja warehouse for store-and-ship clients.
        isWarehouse: o.code === 'ABJ-WSE',
      },
      { upsert: true, new: true },
    );
    officeIds[o.code] = doc.id;
  }
  // One counter login per office for local testing (password = seed admin password).
  for (const [code, email] of [
    ['ABJ-WSE', 'office.wuse@estene.ng'],
    ['LOS-IKJ', 'office.ikeja@estene.ng'],
  ] as const) {
    await AdminModel.updateOne(
      { email },
      {
        $setOnInsert: {
          name: `${code} counter`,
          email,
          role: 'office_agent',
          office: officeIds[code],
          passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 10),
        },
      },
      { upsert: true },
    );
  }
  console.log(`✓ ${OFFICES.length} offices + 2 office agent logins`);

  await PricingConfigModel.updateOne(
    { key: 'default' },
    { $setOnInsert: { key: 'default', ...DEFAULT_PRICING_CONFIG } },
    { upsert: true },
  );
  for (const [a, b, fare] of ROUTES) {
    await RouteRateModel.updateOne(
      orderedPair(zoneIds[a]!, zoneIds[b]!),
      { fare },
      { upsert: true },
    );
  }
  console.log(`✓ pricing + ${ROUTES.length} route fares`);

  const passwordHash = await bcrypt.hash('rider1234', 10);
  const riders = [
    {
      code: 'RD-DEMO01',
      firstName: 'Musa',
      lastName: 'Ibrahim',
      phone: '+2348030000001',
      type: 'company',
      vehicleType: 'bike',
      primaryZone: zoneIds.WSE,
      coverageZones: [zoneIds.WSE, zoneIds.GRK, zoneIds.MTA],
    },
    {
      code: 'RD-DEMO02',
      firstName: 'Chidi',
      lastName: 'Okafor',
      phone: '+2348030000002',
      type: 'partner',
      vehicleType: 'bike',
      fleetName: 'Swift Riders Ltd',
      commissionPct: 20,
      primaryZone: zoneIds.GRK,
      coverageZones: [zoneIds.GRK, zoneIds.APO],
    },
  ];
  for (const r of riders) {
    await RiderModel.updateOne(
      { phone: r.phone },
      { $setOnInsert: { ...r, status: 'active', passwordHash } },
      { upsert: true },
    );
  }
  console.log('✓ demo riders (password: rider1234)');

  if ((await ParcelTagModel.countDocuments({ status: 'available' })) < 20) {
    const { batch } = await TagsService.generateBatch(50);
    console.log(`✓ 50 parcel tags (batch ${batch})`);
  }

  // A store-and-ship client with a small catalogue already on the Wuse shelves.
  const glow = await ClientModel.findOneAndUpdate(
    { name: 'Naija Glow Skincare' },
    {
      $setOnInsert: {
        name: 'Naija Glow Skincare',
        industry: 'ecommerce',
        contact: { name: 'Amaka Eze', phone: '+2348091112233', email: 'ops@naijaglow.ng' },
        address: {
          line: '5 Aminu Kano Crescent',
          zone: zoneIds.WSE,
          area: 'Wuse II',
          city: 'Abuja',
          state: 'FCT',
        },
        billing: { paymentTermsDays: 30 },
        warehousing: {
          enabled: true,
          office: officeIds['ABJ-WSE'],
          monthlyFee: 2_500_000,
          lowStockThreshold: 5,
          enabledAt: new Date(),
        },
      },
    },
    { upsert: true, new: true },
  );
  const catalogue = [
    {
      sku: 'SHEA-250',
      name: 'Whipped shea butter 250ml',
      size: 'small',
      weightKg: 0.3,
      declaredValue: 650_000,
      qty: 40,
      bin: 'A-01',
    },
    {
      sku: 'SOAP-BLK',
      name: 'African black soap',
      size: 'small',
      weightKg: 0.2,
      declaredValue: 250_000,
      qty: 60,
      bin: 'A-02',
    },
    {
      sku: 'OIL-ROSE',
      name: 'Rosehip face oil 30ml',
      size: 'envelope',
      weightKg: 0.1,
      declaredValue: 900_000,
      qty: 4,
      bin: 'B-01',
      fragile: true,
    },
    {
      sku: 'GIFT-BOX',
      name: 'Glow gift box',
      size: 'medium',
      weightKg: 1.2,
      declaredValue: 2_200_000,
      qty: 12,
      bin: 'C-01',
    },
  ] as const;
  for (const { qty, bin, ...p } of catalogue) {
    const product = await ProductModel.findOneAndUpdate(
      { client: glow._id, sku: p.sku },
      { $setOnInsert: { ...p, client: glow._id } },
      { upsert: true, new: true },
    );
    await StockService.add(
      glow._id,
      glow.warehousing!.office,
      product._id,
      qty,
      'received',
      { type: 'system' },
      `seed:${p.sku}`,
      {
        note: 'Opening stock',
      },
    );
    await StockLevelModel.updateOne(
      { product: product._id, office: glow.warehousing!.office },
      { bin },
    );
  }
  console.log('✓ warehousing client "Naija Glow Skincare" with 4 products at ABJ-WSE');

  // A client portal login for the same business (http://localhost:5500).
  await ClientUserModel.updateOne(
    { email: 'amaka@naijaglow.ng' },
    {
      $setOnInsert: {
        client: glow._id,
        name: 'Amaka Eze',
        email: 'amaka@naijaglow.ng',
        passwordHash: await bcrypt.hash('Portal12345', 10),
        mustChangePassword: false,
        isActive: true,
      },
    },
    { upsert: true },
  );
  console.log('✓ client portal login amaka@naijaglow.ng (password: Portal12345)');

  await disconnectDB();
  redis.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
