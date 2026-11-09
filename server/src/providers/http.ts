// Cliente HTTP com timeout, identificação e limitação de taxa por host.

export const USER_AGENT = `Prospecta/0.1 (plataforma de prospeccao; ${process.env.OSM_CONTACT_EMAIL ? `contato: ${process.env.OSM_CONTACT_EMAIL}` : 'contato nao configurado'})`;

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

export async function httpRequest(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9', ...(init.headers ?? {}) },
    });
    return res;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new HttpError(0, `Tempo esgotado ao acessar ${new URL(url).host}`);
    throw new HttpError(0, `Falha de conexão com ${new URL(url).host}: ${e?.cause?.code ?? e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const res = await httpRequest(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} em ${new URL(url).host}`, text.slice(0, 500));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(res.status, `Resposta inválida de ${new URL(url).host}`, text.slice(0, 500));
  }
}

/** Fila que garante intervalo mínimo entre chamadas (ex.: Nominatim = 1 req/s). */
export function rateLimiter(minIntervalMs: number) {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
