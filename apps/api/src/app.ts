import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Readable } from 'node:stream';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { listDeletedOrders, listOrders } from '@factory/engine-orders';
import {
  BusinessError,
  CapabilityRegistry,
  FileTooLargeError,
  MAX_FILE_BYTES,
  CommandDispatcher,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
  accessControlCommands,
  describeAccess,
  describeMe,
  listMembers,
  listMembershipsFor,
  listDeletedFiles,
  listJobs,
  listRecordFiles,
  listRoles,
  openDownload,
  quarantineKey,
  resolveContext,
  selectMembership,
  simulateAccess,
  type Db,
  type IdentityPort,
  type ObjectStorage,
  type RequestContext,
} from '@factory/platform-core';
import { recipe } from '@factory/recipe-inventory-orders';

export interface AppDeps {
  db: Db;
  identity: IdentityPort;
  /** The identity library's HTTP handler, mounted under /api/auth. */
  authHandler: (request: Request) => Promise<Response>;
  publicUrl: string;
  storage: ObjectStorage;
  /** Built web app to serve (on-premise installs serve everything from one address). */
  webRoot?: string;
  logger?: boolean;
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, String(value));
  }
  return headers;
}

export function buildApp({ db, identity, authHandler, publicUrl, storage, webRoot, logger = false }: AppDeps): FastifyInstance {
  const app = Fastify({ logger, genReqId: () => randomUUID(), bodyLimit: 256 * 1024 });
  const publicOrigin = new URL(publicUrl).origin;

  // Browsers send the session cookie automatically, so a state-changing request authenticated by
  // cookie must come from our own page. Bearer-token clients are not exposed to this attack.
  // (The identity library applies the same origin check to its own endpoints.)
  app.addHook('onRequest', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.url.startsWith('/api/auth/')) return;
    if (request.headers.authorization) return;
    if (request.headers.origin !== publicOrigin) {
      return reply.status(403).send({ error: 'forbidden', message: 'Cross-site request rejected.', details: { reasonCode: 'cross_site' } });
    }
  });
  const registry = new CapabilityRegistry(recipe.capabilities);
  const dispatcher = new CommandDispatcher(db, registry).register(...recipe.commands, ...accessControlCommands(registry));
  const targets = recipe.attachmentTargets;

  // Uploads arrive as a raw byte stream; size is enforced while writing to quarantine.
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => done(null, payload));

  async function identityOf(request: FastifyRequest) {
    const who = await identity.authenticate(toHeaders(request));
    if (!who) throw new UnauthenticatedError();
    return who;
  }

  async function contextOf(request: FastifyRequest): Promise<RequestContext> {
    const ctx = await resolveContext(db, await identityOf(request), request.id);
    if (!ctx) throw new BusinessError('no_membership_selected', 'Choose a company first.', 401);
    return ctx;
  }

  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof BusinessError) {
      return reply.status(error.httpStatus).send({ error: error.code, message: error.message, details: error.details });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: 'bad_request', message: error.message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'internal', message: 'Unexpected failure. Nothing was saved.', requestId: request.id });
  });

  app.get('/health', async () => ({ ok: true }));

  // Identity library endpoints (sign-in, sign-out, session). Forwarded as standard fetch requests.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, publicUrl);
      const body = request.method === 'POST' && request.body !== undefined ? JSON.stringify(request.body) : undefined;
      const response = await authHandler(new Request(url, { method: request.method, headers: toHeaders(request), body }));
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });

  // After sign-in: which companies can I act for, and pick one for this session.
  app.get('/session/memberships', async (request) => ({ memberships: await listMembershipsFor(db, await identityOf(request)) }));

  app.post<{ Body: { membershipId?: unknown } }>('/session/membership', async (request) => {
    const who = await identityOf(request);
    const membershipId = request.body?.membershipId;
    if (typeof membershipId !== 'string' || !uuidRe.test(membershipId)) throw new ValidationError({ membershipId: 'required' });
    if (!(await selectMembership(db, who, membershipId))) throw new ForbiddenError('not_your_membership');
    return describeMe(db, (await resolveContext(db, who, request.id))!, registry);
  });

  app.get('/me', async (request) => describeMe(db, await contextOf(request), registry));

  app.post<{ Params: { name: string }; Body: unknown }>('/commands/:name', async (request) => {
    // Internal commands take server-generated values (e.g. storage keys) and are never reachable here.
    if (!dispatcher.isPublic(request.params.name)) throw new BusinessError('not_found', 'command not found.', 404);
    const ctx = await contextOf(request);
    const key = request.headers['idempotency-key'];
    const policy = request.headers['x-policy-version'];
    return dispatcher.dispatch(ctx, request.params.name, request.body ?? {}, {
      idempotencyKey: typeof key === 'string' ? key : '',
      policyVersion: typeof policy === 'string' ? policy : undefined,
    });
  });

  app.get('/orders', async (request) => ({ orders: await listOrders(db, await contextOf(request)) }));

  // ───── Files ─────
  // Bytes go to quarantine first; the upload command then records the version and queues its scan.
  // Nothing becomes downloadable until the scan job has verified and published it.
  async function receiveUpload(request: FastifyRequest, target: { target: { resource: string; recordId: string } } | { fileId: string }) {
    const ctx = await contextOf(request);
    const rawName = request.headers['x-file-name'];
    let originalName = '';
    try {
      if (typeof rawName === 'string') originalName = decodeURIComponent(rawName).replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 255);
    } catch {
      throw new ValidationError({ fileName: 'x-file-name must be URI-encoded' });
    }
    if (!originalName) throw new ValidationError({ fileName: 'x-file-name header is required' });
    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (declaredLength > MAX_FILE_BYTES) throw new BusinessError('file_too_large', `Files are limited to ${MAX_FILE_BYTES} bytes.`, 413);
    const key = quarantineKey(ctx.tenantId);
    let stored;
    try {
      stored = await storage.put(key, request.body as Readable, MAX_FILE_BYTES);
    } catch (error) {
      if (error instanceof FileTooLargeError) throw new BusinessError('file_too_large', `Files are limited to ${MAX_FILE_BYTES} bytes.`, 413);
      throw error;
    }
    const idempotencyKey = request.headers['idempotency-key'];
    try {
      const fingerprint = { ...target, contentHash: stored.sha256, sizeBytes: stored.size, originalName };
      const out = await dispatcher.dispatch(ctx, 'files.upload', { ...fingerprint, quarantineKey: key, declaredType: request.headers['x-file-type'] ?? undefined }, {
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : '',
        fingerprint,
      });
      if (out.replayed) await storage.delete(key); // the first attempt's copy is the one in use
      return out;
    } catch (error) {
      await storage.delete(key);
      throw error;
    }
  }

  app.post<{ Params: { resource: string; id: string } }>('/records/:resource/:id/files', async (request) => {
    if (!uuidRe.test(request.params.id)) throw new ValidationError({ id: 'invalid' });
    return receiveUpload(request, { target: { resource: request.params.resource, recordId: request.params.id } });
  });
  app.post<{ Params: { id: string } }>('/files/:id/versions', async (request) => {
    if (!uuidRe.test(request.params.id)) throw new ValidationError({ id: 'invalid' });
    return receiveUpload(request, { fileId: request.params.id });
  });
  app.get<{ Params: { resource: string; id: string } }>('/records/:resource/:id/files', async (request) => {
    if (!uuidRe.test(request.params.id)) throw new ValidationError({ id: 'invalid' });
    return { files: await listRecordFiles(db, await contextOf(request), targets, request.params.resource, request.params.id) };
  });
  app.get<{ Params: { id: string }; Querystring: { version?: string } }>('/files/:id/content', async (request, reply) => {
    const { id } = request.params;
    const version = request.query.version;
    if (!uuidRe.test(id) || (version !== undefined && !uuidRe.test(version))) throw new ValidationError({ id: 'invalid' });
    const file = await openDownload(db, await contextOf(request), storage, id, version);
    return reply
      .header('content-type', file.contentType)
      .header('content-length', String(file.sizeBytes))
      .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, no-store')
      .send(file.stream);
  });

  // ───── Jobs and recycle bin ─────
  app.get('/jobs', async (request) => listJobs(db, await contextOf(request)));
  app.get('/recycle-bin', async (request) => {
    const ctx = await contextOf(request);
    const items = [...(await listDeletedOrders(db, ctx)), ...(await listDeletedFiles(db, ctx, targets))];
    items.sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime());
    return { items };
  });

  app.get('/permissions/catalog', async (request) => {
    await contextOf(request);
    return { resources: registry.all() };
  });
  app.get('/permissions/members', async (request) => ({ members: await listMembers(db, await contextOf(request)) }));
  app.get('/permissions/roles', async (request) => ({ roles: await listRoles(db, await contextOf(request)) }));
  app.get<{ Params: { id: string } }>('/permissions/members/:id', async (request) => {
    if (!uuidRe.test(request.params.id)) throw new ValidationError({ id: 'invalid' });
    return describeAccess(db, await contextOf(request), registry, request.params.id);
  });
  app.post<{ Body: { membershipId?: string; resource?: string; action?: string; branchId?: string | null } }>(
    '/permissions/simulate',
    async (request) => {
      const { membershipId, resource, action, branchId = null } = request.body ?? {};
      if (!membershipId || !uuidRe.test(membershipId) || !resource || !action || (branchId !== null && !uuidRe.test(branchId))) {
        throw new ValidationError({ body: 'membershipId, resource, action and optional branchId are required' });
      }
      return simulateAccess(db, await contextOf(request), registry, { membershipId, resource, action, branchId });
    },
  );

  if (webRoot && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot, wildcard: false });
    // Single-page app: unknown GET paths render the app, which then routes on the client.
    app.setNotFoundHandler((request, reply) =>
      request.method === 'GET' && request.headers.accept?.includes('text/html')
        ? reply.sendFile('index.html')
        : reply.status(404).send({ error: 'not_found', message: 'Not found.' }),
    );
  }

  return app;
}
