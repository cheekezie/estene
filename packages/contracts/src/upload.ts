import { z } from 'zod';

/**
 * Direct-to-storage uploads: the client asks the API for a short-lived upload
 * URL, PUTs the file there, then sends `fileUrl` with the action it proves
 * (delivery photo, pickup photo).
 */
export const UPLOAD_PURPOSES = ['delivery_proof', 'pickup_photo'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const UploadRequestSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  /** Bytes; checked again by the storage when the file arrives. */
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Photos must be 8 MB or smaller'),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export type UploadTicketDto = {
  /** PUT the raw file bytes here with exactly these headers. */
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  /** Where the file can be read once uploaded — send this as `photoUrl`. */
  fileUrl: string;
  expiresAt: string;
};
