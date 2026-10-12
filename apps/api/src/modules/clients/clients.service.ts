import type { Types } from 'mongoose';
import type {
  ClientDto,
  ClientIndustry,
  ClientInput,
  WebhookConfigInput,
} from '@estene/contracts/client';
import type { ClientStatus } from '@estene/contracts/enums';
import { ACTIVE_RIDER_STATUSES } from '@estene/contracts/shipment-status';
import { decrypt, encrypt, randomToken, sha256 } from '../../lib/crypto';
import { searchRegex } from '../../lib/db';
import { notFound } from '../../lib/errors';
import { redis } from '../../lib/redis';
import { paginate } from '../../lib/response';
import { FinanceService } from '../finance/finance.service';
import { ShipmentModel } from '../shipments/models/shipment.model';
import { ZoneModel } from '../zones/models/zone.model';
import { ClientModel, type IClient } from './models/client.model';

const KEY_PREFIX = 'est_live_';
/** Authenticated API keys are cached briefly so the hot path skips Mongo. */
const KEY_CACHE_TTL_S = 60;
const keyCacheKey = (hash: string) => `apikey:${hash}`;

export type ApiKeyPrincipal = { clientId: string; keyId: string; clientName: string };

type ZoneRef = { _id: Types.ObjectId; name: string; code: string };
type AdminRef = { _id: Types.ObjectId; name: string };

/** Clients are always loaded with these refs so the DTO can name the zone and account manager. */
const CLIENT_POPULATE = [
  { path: 'address.zone', select: 'name code' },
  { path: 'accountManager', select: 'name' },
];

const toDto = (c: IClient): ClientDto => {
  const zone = c.address.zone as unknown as ZoneRef | undefined;
  const manager = c.accountManager as unknown as AdminRef | undefined;
  return {
    id: c._id.toString(),
    name: c.name,
    legalName: c.legalName,
    industry: c.industry,
    rcNumber: c.rcNumber,
    website: c.website,
    contact: {
      name: c.contact.name,
      role: c.contact.role,
      phone: c.contact.phone,
      email: c.contact.email,
    },
    address: {
      line: c.address.line,
      zoneId: zone?._id?.toString(),
      area: c.address.area,
      landmark: c.address.landmark,
      city: c.address.city,
      state: c.address.state,
      zone:
        zone && 'name' in zone
          ? { id: zone._id.toString(), name: zone.name, code: zone.code }
          : null,
    },
    billing: {
      email: c.billing?.email,
      paymentTermsDays: c.billing?.paymentTermsDays ?? 0,
      creditLimit: c.billing?.creditLimit,
    },
    expectedMonthlyVolume: c.expectedMonthlyVolume,
    accountManager:
      manager && 'name' in manager ? { id: manager._id.toString(), name: manager.name } : null,
    notes: c.notes,
    status: c.status,
    apiKeys: c.apiKeys
      .map((k) => ({
        id: k._id.toString(),
        name: k.name,
        preview: k.preview,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
      }))
      .reverse(),
    webhook: c.webhook
      ? {
          url: c.webhook.url,
          events: c.webhook.events,
          isActive: c.webhook.isActive,
          hasSecret: !!c.webhook.secretCipher,
        }
      : null,
    createdAt: c.createdAt.toISOString(),
  };
};

/** Contract shape → stored shape (ids become refs). */
const toDoc = (input: Partial<ClientInput>) => {
  const { accountManagerId, address, ...rest } = input;
  return {
    ...rest,
    ...(accountManagerId !== undefined && { accountManager: accountManagerId }),
    ...(address && { address: { ...address, zone: address.zoneId, zoneId: undefined } }),
  };
};

/** Area names are unique across zones, so an address with only an area still gets its zone. */
async function withResolvedZone<T extends Partial<ClientInput>>(input: T): Promise<T> {
  if (!input.address?.area || input.address.zoneId) return input;
  const zone = await ZoneModel.findOne({ areas: input.address.area }, '_id').lean();
  return zone ? { ...input, address: { ...input.address, zoneId: zone._id.toString() } } : input;
}

async function load(id: string) {
  const client = await ClientModel.findById(id).populate(CLIENT_POPULATE);
  if (!client) throw notFound('Client not found');
  return client;
}

const newWebhookSecret = () => `whsec_${randomToken(24)}`;

async function evictKeys(client: IClient) {
  const hashes = client.apiKeys.map((k) => keyCacheKey(k.hash));
  if (hashes.length) await redis.del(...hashes);
}

export const ClientsService = {
  async list(q: {
    page: number;
    limit: number;
    search?: string;
    status?: ClientStatus;
    industry?: ClientIndustry;
  }) {
    const filter: Record<string, unknown> = {};
    if (q.status) filter.status = q.status;
    if (q.industry) filter.industry = q.industry;
    if (q.search) {
      const rx = searchRegex(q.search);
      filter.$or = [
        { name: rx },
        { legalName: rx },
        { 'contact.name': rx },
        { 'contact.email': rx },
        { 'contact.phone': rx },
        { rcNumber: rx },
      ];
    }
    const [clients, total] = await Promise.all([
      ClientModel.find(filter)
        .populate(CLIENT_POPULATE)
        .sort({ name: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit),
      ClientModel.countDocuments(filter),
    ]);
    return paginate(clients.map(toDto), total, q.page, q.limit);
  },

  /** Lightweight list for pickers, with the pickup defaults a phone booking pre-fills. */
  async options() {
    const clients = await ClientModel.find({ status: 'active' }, 'name contact address')
      .sort({ name: 1 })
      .lean();
    return clients.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      pickup: {
        contactName: c.contact.name,
        phone: c.contact.phone,
        address: c.address.line,
        zoneId: c.address.zone?.toString(),
        area: c.address.area,
        landmark: c.address.landmark,
      },
    }));
  },

  async get(id: string) {
    const client = await load(id);
    const [shipments, activeShipments, outstanding] = await Promise.all([
      ShipmentModel.countDocuments({ client: id }),
      ShipmentModel.countDocuments({
        client: id,
        status: { $in: ['created', ...ACTIVE_RIDER_STATUSES, 'at_hub'] },
      }),
      FinanceService.clientOutstanding(id),
    ]);
    return { ...toDto(client), stats: { shipments, activeShipments, outstanding } };
  },

  async create(input: ClientInput, adminId: string) {
    const client = await ClientModel.create({
      ...toDoc(await withResolvedZone(input)),
      createdBy: adminId,
    });
    return toDto(await load(client.id));
  },

  async update(id: string, input: Partial<ClientInput>) {
    const client = await ClientModel.findByIdAndUpdate(id, toDoc(await withResolvedZone(input)), {
      new: true,
      runValidators: true,
    }).populate(CLIENT_POPULATE);
    if (!client) throw notFound('Client not found');
    return toDto(client);
  },

  async setStatus(id: string, status: ClientStatus) {
    const client = await load(id);
    client.status = status;
    await client.save();
    await evictKeys(client); // suspension must cut API access immediately, not after the cache TTL
    return toDto(client);
  },

  // ── API keys ─────────────────────────────────────────────────────────────
  /** Returns the plaintext key exactly once. Only its SHA-256 is stored. */
  async createApiKey(id: string, name: string) {
    const client = await load(id);
    const key = `${KEY_PREFIX}${randomToken(24)}`;
    client.apiKeys.push({
      name,
      hash: sha256(key),
      preview: `${key.slice(0, KEY_PREFIX.length + 4)}…${key.slice(-4)}`,
    });
    await client.save();
    return { key, client: toDto(client) };
  },

  async revokeApiKey(id: string, keyId: string) {
    const client = await load(id);
    const apiKey = client.apiKeys.id(keyId);
    if (!apiKey) throw notFound('API key not found');
    apiKey.revokedAt ??= new Date();
    await client.save();
    await redis.del(keyCacheKey(apiKey.hash));
    return toDto(client);
  },

  /** Resolves a presented key to its client. Cached in Redis; usage timestamp updated at most every 5 minutes. */
  async authenticateKey(presented: string): Promise<ApiKeyPrincipal | null> {
    if (!presented.startsWith(KEY_PREFIX)) return null;
    const hash = sha256(presented);
    const cached = await redis.get(keyCacheKey(hash));
    if (cached) return JSON.parse(cached);

    const client = await ClientModel.findOne(
      { 'apiKeys.hash': hash, status: 'active' },
      'name apiKeys',
    );
    const apiKey = client?.apiKeys.find((k) => k.hash === hash && !k.revokedAt);
    if (!client || !apiKey) return null;

    const principal: ApiKeyPrincipal = {
      clientId: client.id,
      keyId: apiKey._id.toString(),
      clientName: client.name,
    };
    await redis.set(keyCacheKey(hash), JSON.stringify(principal), 'EX', KEY_CACHE_TTL_S);
    if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > 5 * 60_000) {
      await ClientModel.updateOne(
        { _id: client._id, 'apiKeys._id': apiKey._id },
        { $set: { 'apiKeys.$.lastUsedAt': new Date() } },
      );
    }
    return principal;
  },

  // ── Webhook ──────────────────────────────────────────────────────────────
  /** Saves the endpoint. A signing secret is generated on first setup and returned once in that response. */
  async configureWebhook(id: string, input: WebhookConfigInput) {
    const client = await load(id);
    const isNew = !client.webhook?.secretCipher;
    const secret = isNew ? newWebhookSecret() : null;
    client.webhook = {
      ...input,
      secretCipher: secret ? encrypt(secret) : client.webhook!.secretCipher,
    };
    await client.save();
    return { client: toDto(client), secret };
  },

  async revealWebhookSecret(id: string) {
    const client = await load(id);
    if (!client.webhook) throw notFound('No webhook configured');
    return { secret: decrypt(client.webhook.secretCipher) };
  },

  async rotateWebhookSecret(id: string) {
    const client = await load(id);
    if (!client.webhook) throw notFound('No webhook configured');
    const secret = newWebhookSecret();
    client.webhook.secretCipher = encrypt(secret);
    await client.save();
    return { secret };
  },

  async removeWebhook(id: string) {
    const client = await load(id);
    client.webhook = undefined;
    await client.save();
    return toDto(client);
  },
};
