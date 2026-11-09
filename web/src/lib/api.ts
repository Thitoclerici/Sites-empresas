// Cliente da API.
import type { Activity, Asset, Business, Fact, MissingItem, IntegrationStatus } from '../../../shared/types.ts';
import type { SiteSpec, SectionDef } from '../../../shared/site.ts';
import type { SegmentProfile, ThemePreset } from '../../../shared/segments.ts';

export type BusinessX = Business & { saved: boolean };
export interface SiteSummary { id: string; businessId: string; name: string; status: SiteStatus; version: number; createdAt: string; updatedAt: string }
export type SiteStatus = 'draft' | 'reviewed' | 'approved_by_client' | 'published';
export interface SiteRecord extends SiteSummary { spec: SiteSpec }
export interface Detail {
  business: BusinessX;
  segment: SegmentProfile;
  facts: Fact[];
  assets: Asset[];
  sites: SiteSummary[];
  activities: Activity[];
  missing: MissingItem[];
}
export interface Config {
  integrations: IntegrationStatus;
  segments: { id: string; label: string; plural: string; contentKind: string; presets: ThemePreset[] }[];
  stages: { id: string; label: string }[];
  sectionDefs: SectionDef[];
  agencyName: string;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => req<T>('GET', url),
  post: <T>(url: string, body?: unknown) => req<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => req<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => req<T>('PATCH', url, body),
  del: <T>(url: string) => req<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => req<T>('POST', url, form),
};

export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
