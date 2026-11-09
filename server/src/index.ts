// Servidor HTTP: API + (em produção) arquivos estáticos da interface.

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import './db.ts';
import { apiRoutes } from './routes/api.ts';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 5 * 1024 * 1024 });
await app.register(multipart);
await app.register(apiRoutes);

const dist = resolve('web/dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Rota não encontrada' }) : reply.sendFile('index.html')));
}

await app.listen({ port: PORT, host: HOST });
