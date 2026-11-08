import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { AppError } from './errors';

/**
 * Cloudflare R2 (it speaks the S3 API, hence the AWS SDK). Two buckets:
 * - R2_BUCKET: public through its custom domain — delivery photos under random keys.
 * - R2_DOCUMENTS_BUCKET: no public access — rider vetting documents, opened only
 *   through short-lived signed links.
 */
let client: S3Client | null = null;
export const r2 = () =>
  (client ??= new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
    // R2 addresses buckets by path on its account endpoint.
    forcePathStyle: true,
    // Newer SDKs sign a checksum into presigned URLs by default — a checksum of an
    // empty body, so the real upload would be rejected. Only add one when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));

export function assertR2(bucket: string | undefined, what: string): asserts bucket is string {
  if (!env.R2_ACCOUNT_ID || !bucket)
    throw new AppError(
      503,
      `${what} are not set up. Add the R2_* settings to the API.`,
      'STORAGE_NOT_CONFIGURED',
    );
}
