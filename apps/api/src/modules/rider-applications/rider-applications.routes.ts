import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ObjectIdSchema } from '@estene/contracts/common';
import {
  MAX_RIDER_DOCUMENT_BYTES,
  RIDER_DOCUMENT_CONTENT_TYPES,
  RiderApplicationApproveSchema,
  RiderApplicationListQuerySchema,
  RiderApplicationNoteSchema,
  RiderApplicationRejectSchema,
  RiderApplicationVettingSchema,
  RiderDocumentUploadQuerySchema,
} from '@estene/contracts/rider-application';
import { badRequest } from '../../lib/errors';
import { parse, send } from '../../lib/response';
import { requireActor, requireRole } from '../../plugins/auth';
import { RiderApplicationsService } from './rider-applications.service';

const IdParams = z.object({ id: ObjectIdSchema });
const DocParams = IdParams.extend({ docId: ObjectIdSchema });

/** Admin review of rider applications. Documents are ID papers, so ops managers only. */
export async function riderApplicationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireActor('admin'));
  app.addHook('preHandler', requireRole('ops_manager'));

  // Document uploads arrive as the raw file body (no multipart).
  app.addContentTypeParser(
    [...RIDER_DOCUMENT_CONTENT_TYPES],
    { parseAs: 'buffer', bodyLimit: MAX_RIDER_DOCUMENT_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.get('/', async (req, reply) =>
    send(
      reply,
      await RiderApplicationsService.list(parse(RiderApplicationListQuerySchema, req.query)),
    ),
  );

  app.get('/:id', async (req, reply) =>
    send(reply, await RiderApplicationsService.get(parse(IdParams, req.params).id)),
  );

  app.post('/:id/vetting', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(RiderApplicationVettingSchema, req.body);
    return send(
      reply,
      await RiderApplicationsService.scheduleVetting(id, input, req.user.sub),
      200,
      'Vetting scheduled',
    );
  });

  app.post('/:id/notes', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { note } = parse(RiderApplicationNoteSchema, req.body);
    return send(reply, await RiderApplicationsService.addNote(id, note, req.user.sub), 201);
  });

  app.post('/:id/documents', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const meta = parse(RiderDocumentUploadQuerySchema, req.query);
    if (!Buffer.isBuffer(req.body)) throw badRequest('Upload a PDF or a photo (JPEG, PNG or WebP)');
    return send(
      reply,
      await RiderApplicationsService.addDocument(
        id,
        { ...meta, contentType: req.headers['content-type']?.split(';')[0] },
        req.body,
        req.user.sub,
      ),
      201,
      'Document uploaded',
    );
  });

  app.get('/:id/documents/:docId/link', async (req, reply) => {
    const { id, docId } = parse(DocParams, req.params);
    return send(reply, await RiderApplicationsService.documentLink(id, docId));
  });

  app.delete('/:id/documents/:docId', async (req, reply) => {
    const { id, docId } = parse(DocParams, req.params);
    return send(
      reply,
      await RiderApplicationsService.removeDocument(id, docId, req.user.sub),
      200,
      'Document removed',
    );
  });

  app.post('/:id/approve', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(RiderApplicationApproveSchema, req.body);
    return send(
      reply,
      await RiderApplicationsService.approve(id, input, req.user.sub),
      201,
      'Approved — rider created',
    );
  });

  app.post('/:id/reject', async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { reason } = parse(RiderApplicationRejectSchema, req.body);
    return send(
      reply,
      await RiderApplicationsService.reject(id, reason, req.user.sub),
      200,
      'Application rejected',
    );
  });
}
