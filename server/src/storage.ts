// Armazenamento persistente opcional no Supabase Storage (plano gratuito).
// Usado quando o servidor roda num serviço sem disco permanente (ex.: Render gratuito):
//  - cópia do banco SQLite (restaurada ao iniciar, atualizada após alterações)
//  - arquivos enviados (fotos, logotipos), com cache local
// Sem SUPABASE_URL/SUPABASE_SERVICE_KEY, tudo fica apenas no disco local.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { UPLOAD_DIR } from './paths.ts';

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const BUCKET = process.env.SUPABASE_BUCKET || 'prospecta';

export const remoteEnabled = () => !!(URL_BASE && KEY);

// Chaves antigas (service_role) são JWT e vão também no Authorization; as novas (sb_secret_…) só no apikey.
const headers = (): Record<string, string> => (KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}`, apikey: KEY } : { apikey: KEY });

async function call(method: string, path: string, body?: BodyInit, extra: Record<string, string> = {}) {
  return fetch(`${URL_BASE}/storage/v1/${path}`, { method, body, headers: { ...headers(), ...extra } });
}

/** Cria o bucket privado, se ainda não existir. */
export async function ensureBucket() {
  if (!remoteEnabled()) return;
  const res = await call('GET', `bucket/${BUCKET}`);
  if (res.ok) return;
  const created = await call('POST', 'bucket', JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), { 'Content-Type': 'application/json' });
  if (!created.ok && created.status !== 409) throw new Error(`Supabase: não foi possível criar o bucket (${created.status} ${await created.text()})`);
}

export async function remotePut(key: string, data: Buffer, mime = 'application/octet-stream') {
  if (!remoteEnabled()) return;
  const res = await call('POST', `object/${BUCKET}/${key}`, new Uint8Array(data), { 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': 'no-cache' });
  if (!res.ok) throw new Error(`Supabase: falha ao salvar ${key} (${res.status} ${await res.text()})`);
}

export async function remoteGet(key: string): Promise<Buffer | null> {
  if (!remoteEnabled()) return null;
  const res = await call('GET', `object/authenticated/${BUCKET}/${key}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Supabase: falha ao ler ${key} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function remoteDelete(key: string) {
  if (!remoteEnabled()) return;
  await call('DELETE', `object/${BUCKET}`, JSON.stringify({ prefixes: [key] }), { 'Content-Type': 'application/json' }).catch(() => undefined);
}

/* ---------- arquivos enviados ---------- */

export async function saveUpload(storedName: string, data: Buffer, mime: string) {
  const path = join(UPLOAD_DIR, storedName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  await remotePut(`uploads/${storedName}`, data, mime);
}

/** Lê do disco; se o disco foi apagado (reinício), busca a cópia remota e recria o cache. */
export async function readUpload(storedName: string): Promise<Buffer> {
  const path = join(UPLOAD_DIR, storedName);
  try {
    return await readFile(path);
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
    const remote = await remoteGet(`uploads/${storedName}`);
    if (!remote) throw Object.assign(new Error('Arquivo não encontrado'), { statusCode: 404 });
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path, remote);
    return remote;
  }
}

export async function deleteUpload(storedName: string) {
  await unlink(join(UPLOAD_DIR, storedName)).catch(() => undefined);
  await remoteDelete(`uploads/${storedName}`);
}
