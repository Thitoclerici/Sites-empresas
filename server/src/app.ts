// Aplicação HTTP: API + links públicos + (em produção) arquivos estáticos do Hub.

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';
import { flushBackup, scheduleBackup, setSnapshot } from './persist.ts';
import { authRequired, authRoutes } from './auth.ts';
import { apiRoutes } from './routes/api.ts';
import { publicRoutes } from './routes/public.ts';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

if (process.env.NODE_ENV === 'production' && !authRequired()) {
  console.error('ERRO: defina HUB_PASSWORD para rodar em produção (o Hub não pode ficar aberto na internet).');
  process.exit(1);
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
await app.register(multipart);

// Cópia do banco no armazenamento remoto após cada alteração bem-sucedida.
setSnapshot((path) => db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`));
app.addHook('onResponse', async (req, reply) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && reply.statusCode < 400) scheduleBackup();
});
// Links públicos também alteram o banco (contador de visualizações).
app.addHook('onResponse', async (req) => {
  if (req.method === 'GET' && req.url.startsWith('/d/') && !req.url.includes('/a/')) scheduleBackup(15000);
});
await authRoutes(app); // na raiz: o hook de login vale para todas as rotas
await app.register(apiRoutes);
await app.register(publicRoutes);

const dist = resolve('web/dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Rota não encontrada' }) : reply.sendFile('index.html')));
}

await app.listen({ port: PORT, host: HOST });

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, async () => {
    app.log.info(`${sig}: salvando dados antes de encerrar…`);
    await flushBackup();
    await app.close();
    process.exit(0);
  });
}
