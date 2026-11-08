import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@estene/contracts/upload';
import { parse, send } from '../../lib/response';
import { UploadsService } from './uploads.service';

const LocalQuery = z.object({
  key: z.string().min(1).max(200),
  ct: z.enum(UPLOAD_CONTENT_TYPES),
  size: z.string().regex(/^\d+$/),
  exp: z.string().regex(/^\d+$/),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Development stand-in for a bucket (`STORAGE_PROVIDER=local`): accepts the
 * signed PUT from `UploadsService.createTicket` and serves files back.
 * Only registered outside production.
 */
export async function localUploadRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    [...UPLOAD_CONTENT_TYPES],
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.put('/local', async (req, reply) => {
    const body = req.body;
    if (!Buffer.isBuffer(body)) return send(reply, null, 400, 'Send the file bytes as the body');
    await UploadsService.saveLocal(
      parse(LocalQuery, req.query),
      req.headers['content-type']?.split(';')[0],
      body,
    );
    return send(reply, null, 200, 'Uploaded');
  });

  app.get('/files/*', async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    const file = await UploadsService.openLocal(key);
    return (
      reply
        .header('Content-Type', file.type)
        .header('Content-Length', file.size)
        .header('Cache-Control', 'private, max-age=3600')
        // The admin (another origin) shows these photos.
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(file.stream)
    );
  });
}
