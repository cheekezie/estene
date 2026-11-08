import type { UploadPurpose, UploadTicketDto } from '@estene/contracts/upload';
import { MAX_UPLOAD_BYTES } from '@estene/contracts/upload';
import { ApiError, api } from './api';

/**
 * Sends a photo straight to storage: the API hands out a short-lived upload
 * URL, the phone PUTs the file there, and the resulting `fileUrl` goes with
 * the delivery confirmation.
 */
export async function uploadPhoto(uri: string, purpose: UploadPurpose) {
  const file = await (await fetch(uri)).blob();
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('That photo is too large. Retake it.', 400);
  const contentType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const ticket = await api.post<UploadTicketDto>('/api/rider/uploads', {
    purpose,
    contentType,
    size: file.size,
  });
  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
    });
  } catch {
    throw new ApiError('Photo upload failed — check your connection and try again.', 0, 'NETWORK');
  }
  if (!res.ok) throw new ApiError(`Photo upload failed (${res.status}). Try again.`, res.status);
  return ticket.fileUrl;
}
