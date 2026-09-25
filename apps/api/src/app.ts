import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { listOrders, orderCommands } from '@factory/engine-orders';
import {
  BusinessError,
  CommandDispatcher,
  UnauthenticatedError,
  grantPermission,
  revokePermission,
  type Db,
  type IdentityPort,
  type RequestContext,
} from '@factory/platform-core';

export interface AppDeps {
  db: Db;
  identity: IdentityPort;
  logger?: boolean;
}

export function buildApp({ db, identity, logger = false }: AppDeps): FastifyInstance {
  const app = Fastify({ logger, genReqId: () => randomUUID(), bodyLimit: 256 * 1024 });
  const dispatcher = new CommandDispatcher(db).register(...orderCommands, grantPermission, revokePermission);

  async function contextOf(request: FastifyRequest): Promise<RequestContext> {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = token ? await identity.resolve(token) : null;
    if (!session) throw new UnauthenticatedError();
    return { tenantId: session.tenantId, membershipId: session.membershipId, sessionId: session.sessionId, requestId: request.id };
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

  app.post<{ Params: { name: string }; Body: unknown }>('/commands/:name', async (request) => {
    const ctx = await contextOf(request);
    const key = request.headers['idempotency-key'];
    return dispatcher.dispatch(ctx, request.params.name, request.body ?? {}, typeof key === 'string' ? key : '');
  });

  app.get('/orders', async (request) => ({ orders: await listOrders(db, await contextOf(request)) }));

  return app;
}
