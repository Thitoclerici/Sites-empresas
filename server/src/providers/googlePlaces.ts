// Google Places API (New) — opcional. Usada para confirmar existência de site,
// telefone e horários. Requer GOOGLE_PLACES_API_KEY.
// Atenção aos Termos do Google Maps Platform: além do place_id, o conteúdo não
// deve ser armazenado por mais de 30 dias — os fatos recebem nota de validade.

import { fetchJson } from './http.ts';

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.websiteUri', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.regularOpeningHours', 'places.googleMapsUri', 'places.businessStatus', 'places.primaryTypeDisplayName',
].join(',');

export const googleEnabled = () => !!process.env.GOOGLE_PLACES_API_KEY;

export interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
}

function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

function nameSimilarity(a: string, b: string) {
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Procura o estabelecimento no Google e retorna o melhor candidato (ou null). */
export async function findGooglePlace(name: string, lat?: number, lon?: number, address?: string): Promise<{ place: GooglePlace; confidence: number } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const body: Record<string, unknown> = {
    textQuery: [name, address].filter(Boolean).join(', '),
    languageCode: 'pt-BR',
    regionCode: 'BR',
    pageSize: 5,
  };
  if (lat != null && lon != null) body.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 300 } };
  const data = await fetchJson<{ places?: GooglePlace[] }>(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
  });
  let best: { place: GooglePlace; confidence: number } | null = null;
  for (const p of data.places ?? []) {
    const sim = nameSimilarity(name, p.displayName?.text ?? '');
    const dist = lat != null && lon != null && p.location ? distanceM(lat, lon, p.location.latitude, p.location.longitude) : 9999;
    const distScore = dist < 60 ? 1 : dist < 200 ? 0.7 : dist < 500 ? 0.3 : 0;
    const confidence = sim * 0.6 + distScore * 0.4;
    if (confidence >= 0.6 && (!best || confidence > best.confidence)) best = { place: p, confidence };
  }
  return best;
}
