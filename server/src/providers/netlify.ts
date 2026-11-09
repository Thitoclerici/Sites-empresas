// Netlify: hospedagem dos sites aprovados (rápida, com HTTPS automático e sem "dormir").
// Requer NETLIFY_AUTH_TOKEN (token pessoal: Netlify → User settings → Applications → New access token).

import { httpRequest } from './http.ts';

const API = (process.env.NETLIFY_API_URL ?? 'https://api.netlify.com/api/v1').replace(/\/$/, '');
/** IP do balanceador da Netlify para domínios raiz (confirme no painel da Netlify, em Domain management). */
export const NETLIFY_APEX_IP = process.env.NETLIFY_APEX_IP ?? '75.2.60.5';

export const netlifyEnabled = () => !!process.env.NETLIFY_AUTH_TOKEN;

export class NetlifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, contentType = 'application/json', timeoutMs = 60000): Promise<T> {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) throw new NetlifyError(503, 'Hospedagem não configurada: defina NETLIFY_AUTH_TOKEN nas variáveis do servidor.');
  const res = await httpRequest(`${API}${path}`, {
    method,
    timeoutMs,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': contentType } : {}) },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* resposta sem JSON */
  }
  if (!res.ok) {
    const msg = data?.errors ? JSON.stringify(data.errors) : data?.message ?? text.slice(0, 200);
    if (res.status === 401) throw new NetlifyError(401, 'Token da Netlify inválido ou expirado. Gere um novo e atualize NETLIFY_AUTH_TOKEN.');
    throw new NetlifyError(res.status, `Netlify respondeu ${res.status}: ${msg}`);
  }
  return data as T;
}

export interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url?: string;
  admin_url?: string;
  default_domain?: string;
  custom_domain?: string | null;
  ssl?: boolean;
}

export interface NetlifyDeploy {
  id: string;
  state: string; // uploading | processing | ready | error ...
  error_message?: string;
  ssl_url?: string;
  deploy_ssl_url?: string;
}

export const createSite = (name: string) => call<NetlifySite>('POST', '/sites', { name });
export const getSite = (id: string) => call<NetlifySite>('GET', `/sites/${id}`);
export const deleteSite = (id: string) => call<null>('DELETE', `/sites/${id}`);
export const deployZip = (siteId: string, zip: Buffer) => call<NetlifyDeploy>('POST', `/sites/${siteId}/deploys`, zip, 'application/zip', 120000);
export const getDeploy = (id: string) => call<NetlifyDeploy>('GET', `/deploys/${id}`);
export const setCustomDomain = (siteId: string, domain: string | null, aliases: string[]) =>
  call<NetlifySite>('PATCH', `/sites/${siteId}`, { custom_domain: domain, domain_aliases: aliases });
export const provisionSsl = (siteId: string) => call<unknown>('POST', `/sites/${siteId}/ssl`);
