// Autenticação simples do Hub: uma senha (HUB_PASSWORD) e cookie de sessão assinado.
// Sem HUB_PASSWORD, o Hub fica aberto (apenas para uso local).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'prospecta_session';
const MAX_AGE_S = 30 * 24 * 3600;

export const authRequired = () => !!process.env.HUB_PASSWORD;

function secret() {
  return process.env.SESSION_SECRET || createHmac('sha256', 'prospecta').update(process.env.HUB_PASSWORD ?? '').digest('hex');
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function makeToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${exp}.${randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function validToken(token?: string) {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;
  return Number(payload.split('.')[0]) > Date.now() / 1000;
}

function readCookie(req: FastifyRequest, name: string) {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function isHttps(req: FastifyRequest) {
  return req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
}

export function isAuthenticated(req: FastifyRequest) {
  return !authRequired() || validToken(readCookie(req, COOKIE));
}

const PUBLIC_API = new Set(['/api/login', '/api/logout', '/api/auth/status', '/api/health']);

// Tentativas de login: limite simples por IP contra força bruta.
const attempts = new Map<string, { n: number; until: number }>();

export async function authRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0]!;
    if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return;
    if (!isAuthenticated(req)) return reply.code(401).send({ error: 'Faça login para continuar.' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/auth/status', async (req) => ({ required: authRequired(), authenticated: isAuthenticated(req) }));

  app.post('/api/login', async (req, reply) => {
    if (!authRequired()) return { ok: true };
    const ip = req.ip;
    const a = attempts.get(ip);
    if (a && a.until > Date.now()) return reply.code(429).send({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const password = String((req.body as any)?.password ?? '');
    const ok = password.length > 0 && password.length === process.env.HUB_PASSWORD!.length && timingSafeEqual(Buffer.from(password), Buffer.from(process.env.HUB_PASSWORD!));
    if (!ok) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(ip, { n, until: n >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
      return reply.code(401).send({ error: 'Senha incorreta.' });
    }
    attempts.delete(ip);
    reply.header('Set-Cookie', `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${isHttps(req) ? '; Secure' : ''}`);
    return { ok: true };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.header('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });
}
