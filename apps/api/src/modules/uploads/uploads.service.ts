import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadRequest, UploadTicketDto } from '@estene/contracts/upload';
import { env } from '../../config/env';
import { assertR2, r2 } from '../../lib/r2';

/**
 * Delivery photos live in the public R2 bucket. The API never streams them
 * through itself: it hands out a short-lived PUT URL for one object and the
 * phone uploads straight to the bucket.
 */
const TICKET_TTL_S = 10 * 60;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Random, unguessable keys grouped by purpose and month: delivery_proof/2026/11/<uuid>.jpg */
function newKey(purpose: string, contentType: string) {
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${purpose}/${month}/${randomUUID()}.${EXT[contentType]}`;
}

const publicBase = () => (env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

export const UploadsService = {
  async createTicket(req: UploadRequest): Promise<UploadTicketDto> {
    assertR2(env.R2_BUCKET, 'Photo uploads');
    const key = newKey(req.purpose, req.contentType);
    const uploadUrl = await getSignedUrl(
      r2(),
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        ContentType: req.contentType,
        ContentLength: req.size,
        CacheControl: CACHE_CONTROL,
      }),
      { expiresIn: TICKET_TTL_S },
    );
    return {
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': req.contentType, 'Cache-Control': CACHE_CONTROL },
      fileUrl: `${publicBase()}/${key}`,
      expiresAt: new Date(Date.now() + TICKET_TTL_S * 1000).toISOString(),
    };
  },

  /** True when a URL points at a file in our bucket — clients can't attach arbitrary links as proof. */
  isOurFile(url: string) {
    const base = publicBase();
    return Boolean(base) && url.startsWith(`${base}/`);
  },
};
