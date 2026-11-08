import { createHmac, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadRequest, UploadTicketDto } from '@estene/contracts/upload';
import { MAX_UPLOAD_BYTES } from '@estene/contracts/upload';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';

/**
 * Direct-to-storage uploads. The API never streams photos through itself in
 * production: it hands out a short-lived PUT URL for one object, and the
 * client uploads straight to the bucket (Cloudflare R2; any S3-compatible store works).
 *
 * `local` mimics that in development: the PUT URL points back at this API,
 * signed with an HMAC, and files land in apps/api/.uploads.
 */
const TICKET_TTL_S = 10 * 60;
const LOCAL_DIR = join(process.cwd(), '.uploads');
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

let s3: S3Client | null = null;
const s3Client = () =>
  (s3 ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
    // R2 addresses buckets by path on its account endpoint.
    forcePathStyle: true,
    // Newer SDKs sign a checksum into presigned URLs by default — a checksum of an
    // empty body, so the real upload would be rejected. Only add one when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));

/** Random, unguessable keys grouped by purpose and month: delivery_proof/2026/11/<uuid>.jpg */
function newKey(purpose: string, contentType: string) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${purpose}/${month}/${randomUUID()}.${EXT[contentType]}`;
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');
const publicBase = () =>
  env.STORAGE_PROVIDER === 's3'
    ? trimSlash(env.S3_PUBLIC_URL ?? '')
    : `${trimSlash(env.API_PUBLIC_URL)}/api/uploads/files`;

// ── Local (development) signing ──
const localSignature = (key: string, contentType: string, size: number, exp: number) =>
  createHmac('sha256', env.JWT_SECRET)
    .update(`${key}\n${contentType}\n${size}\n${exp}`)
    .digest('hex');

export const UploadsService = {
  async createTicket(req: UploadRequest): Promise<UploadTicketDto> {
    const key = newKey(req.purpose, req.contentType);
    const expiresAt = new Date(Date.now() + TICKET_TTL_S * 1000);
    const fileUrl = `${publicBase()}/${key}`;

    if (env.STORAGE_PROVIDER === 's3') {
      const uploadUrl = await getSignedUrl(
        s3Client(),
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ContentType: req.contentType,
          ContentLength: req.size,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
        { expiresIn: TICKET_TTL_S },
      );
      return {
        uploadUrl,
        method: 'PUT',
        headers: {
          'Content-Type': req.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        fileUrl,
        expiresAt: expiresAt.toISOString(),
      };
    }

    const exp = Math.floor(expiresAt.getTime() / 1000);
    const params = new URLSearchParams({
      key,
      ct: req.contentType,
      size: String(req.size),
      exp: String(exp),
      sig: localSignature(key, req.contentType, req.size, exp),
    });
    return {
      uploadUrl: `${trimSlash(env.API_PUBLIC_URL)}/api/uploads/local?${params}`,
      method: 'PUT',
      headers: { 'Content-Type': req.contentType },
      fileUrl,
      expiresAt: expiresAt.toISOString(),
    };
  },

  /** True when a URL points at a file we stored — clients can't attach arbitrary links as proof. */
  isOurFile(url: string) {
    return url.startsWith(`${publicBase()}/`);
  },

  // ── Local provider endpoints (development only) ──

  async saveLocal(
    q: { key: string; ct: string; size: string; exp: string; sig: string },
    contentType: string | undefined,
    body: Buffer,
  ) {
    const exp = Number(q.exp);
    const size = Number(q.size);
    const expected = localSignature(q.key, q.ct, size, exp);
    if (q.sig !== expected || exp * 1000 < Date.now())
      throw badRequest('Upload link expired or invalid', 'UPLOAD_EXPIRED');
    if (contentType !== q.ct) throw badRequest('Content-Type does not match the upload link');
    if (body.length !== size || size > MAX_UPLOAD_BYTES)
      throw badRequest('File size does not match the upload link');
    const path = localPath(q.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return null;
  },

  async openLocal(key: string) {
    const path = localPath(key);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw notFound('File not found');
    const ext = path.split('.').pop() ?? '';
    const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
    return { stream: createReadStream(path), type, size: info.size };
  },
};

/** Keeps a key inside the uploads folder (no ../ escapes). */
function localPath(key: string) {
  const path = normalize(join(LOCAL_DIR, key));
  if (!path.startsWith(LOCAL_DIR + '/')) throw badRequest('Invalid file key');
  return path;
}
