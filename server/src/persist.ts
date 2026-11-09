// Persistência do banco SQLite no Supabase Storage (quando configurado).
// - restoreDatabase(): antes de abrir o banco, baixa a última cópia se o disco estiver vazio
// - scheduleBackup(): após alterações, envia uma cópia consistente (VACUUM INTO) com atraso curto
// - flushBackup(): no desligamento (SIGTERM), garante que a última alteração foi salva

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DB_PATH } from './paths.ts';
import { ensureBucket, remoteEnabled, remoteGet, remotePut } from './storage.ts';

const KEY = 'db/prospecta.db';
let timer: NodeJS.Timeout | null = null;
let pending = false;
let running: Promise<void> | null = null;
let snapshotFn: ((path: string) => void) | null = null;

export async function restoreDatabase(log: (m: string) => void = console.log) {
  if (!remoteEnabled()) return;
  await ensureBucket();
  if (existsSync(DB_PATH)) return;
  const data = await remoteGet(KEY);
  if (!data) {
    log('Supabase: nenhuma cópia do banco encontrada; iniciando banco novo.');
    return;
  }
  await mkdir(dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, data);
  log(`Supabase: banco restaurado (${(data.length / 1024).toFixed(0)} KB).`);
}

/** Registra a função que grava um snapshot consistente do banco num arquivo. */
export function setSnapshot(fn: (path: string) => void) {
  snapshotFn = fn;
}

async function runBackup() {
  if (!snapshotFn || !remoteEnabled()) return;
  pending = false;
  const tmp = `${DB_PATH}.snapshot`;
  await rm(tmp, { force: true });
  snapshotFn(tmp);
  const data = await readFile(tmp);
  await remotePut(KEY, data);
  await rm(tmp, { force: true });
}

export function scheduleBackup(delayMs = 4000) {
  if (!remoteEnabled()) return;
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    running = (running ?? Promise.resolve())
      .then(runBackup)
      .catch((e) => console.error('Falha ao salvar cópia do banco:', e.message));
  }, delayMs);
}

export async function flushBackup() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (running) await running.catch(() => undefined);
  if (pending) await runBackup().catch((e) => console.error('Falha ao salvar cópia do banco:', e.message));
}
