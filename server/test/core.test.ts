import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLinks } from '../src/providers/links.ts';
import { parseOpeningHours } from '../../shared/hours.ts';
import { classifyOsm } from '../../shared/segments.ts';
import { renderSite } from '../../shared/render.ts';
import type { SiteSpec } from '../../shared/site.ts';

test('ausência de site no OSM não é tratada como confirmada', () => {
  assert.equal(analyzeLinks({ name: 'X' }).status, 'unverified');
});

test('redes sociais e plataformas não contam como site próprio', () => {
  const r = analyzeLinks({ website: 'https://instagram.com/cafe', 'contact:facebook': 'cafe' });
  assert.equal(r.status, 'social_only');
  assert.equal(r.website, undefined);
  assert.equal(r.socials.facebook, 'https://www.facebook.com/cafe');
  assert.equal(analyzeLinks({ website: 'https://www.ifood.com.br/delivery/x' }).status, 'social_only');
  assert.equal(analyzeLinks({ website: 'cafeexemplo.com.br' }).status, 'has_site');
});

test('horário OSM convertido para português', () => {
  assert.deepEqual(parseOpeningHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off'), [
    { days: 'Segunda a Sexta', hours: '08:00 às 18:00' },
    { days: 'Sábado', hours: '09:00 às 14:00' },
    { days: 'Domingo', hours: 'Fechado' },
  ]);
  assert.equal(parseOpeningHours('Mo-Fr 08:00-18:00 "por agendamento"'), null);
});

test('classificação de segmentos', () => {
  assert.equal(classifyOsm({ amenity: 'restaurant', cuisine: 'pizza' }), 'pizzeria');
  assert.equal(classifyOsm({ shop: 'hairdresser', name: 'Barbearia do Zé' }), 'barbershop');
  assert.equal(classifyOsm({ shop: 'hairdresser' }), 'beauty_salon');
});

const spec: SiteSpec = {
  version: 1, businessName: '<script>alert(1)</script>', segment: 'cafe', lang: 'pt-BR',
  theme: { primary: '#6F4E37', secondary: '#C8A27C', accent: '#D9822B', background: '#FBF7F2', surface: '#FFFFFF', text: '#2B1E16', muted: '#7A6A5E', headingFont: 'Fraunces', bodyFont: 'Inter', radius: 12, heroStyle: 'split' },
  seo: { title: 't', description: 'd' }, nav: [],
  sections: [
    { id: 'h', type: 'hero', visible: true, props: { headline: 'Olá', image: 'proibida', ctaHref: 'javascript:alert(1)', ctaLabel: 'x' }, origins: {}, pending: [] },
    { id: 'm', type: 'menu', visible: true, props: { title: 'Cardápio', groups: [] }, origins: {}, pending: ['Cardápio não encontrado'] },
  ],
  business: { socials: {} }, meta: { generatedAt: new Date().toISOString(), generator: 'template' },
};

test('renderizador escapa HTML, bloqueia links perigosos e imagens não autorizadas', () => {
  const html = renderSite(spec, { mode: 'preview', resolveAsset: () => null, demoNotice: 'Demo' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('proibida'));
  assert.ok(html.includes('noindex'));
});

test('seções sem dados ficam ocultas para o cliente e visíveis como pendência no editor', () => {
  const client = renderSite(spec, { mode: 'preview', resolveAsset: () => null, demoNotice: null });
  const editor = renderSite(spec, { mode: 'editor', resolveAsset: () => null, demoNotice: null });
  assert.ok(!client.includes('Cardápio não encontrado'));
  assert.ok(editor.includes('Cardápio não encontrado'));
  assert.ok(!client.includes('noindex'));
});

import { themeFor, buildDirection, sectionPlan, contrast } from '../../shared/design.ts';
import { evaluateSite } from '../../shared/quality.ts';

test('três conceitos com composições diferentes (não só cores)', () => {
  const htmls = (['refined', 'bold', 'inviting'] as const).map((c) => {
    const s: SiteSpec = { ...spec, businessName: 'Café Teste', segment: 'cafe', theme: themeFor('cafe', c), sections: [{ id: 'h', type: 'hero', visible: true, props: { headline: 'Frase', ctaLabel: 'Ver', ctaHref: '#cardapio' }, origins: {}, pending: [] }] };
    return renderSite(s, { mode: 'preview', resolveAsset: () => null, demoNotice: null });
  });
  assert.ok(htmls[0]!.includes('class="c-refined"') && htmls[0]!.includes('hr-name'));
  assert.ok(htmls[1]!.includes('class="c-bold"') && htmls[1]!.includes('hb-name'));
  assert.ok(htmls[2]!.includes('class="c-inviting"') && htmls[2]!.includes('hi-visual'));
  assert.notEqual(themeFor('cafe', 'refined').headingFont, themeFor('cafe', 'bold').headingFont);
  assert.notDeepEqual(sectionPlan('refined', 'food'), sectionPlan('inviting', 'food'));
});

test('sem foto autorizada usa arte gráfica e sinaliza a limitação', () => {
  const s: SiteSpec = { ...spec, theme: themeFor('cafe', 'refined'), sections: [{ id: 'h', type: 'hero', visible: true, props: { headline: 'x', image: 'nao-autorizada' }, origins: {}, pending: [] }] };
  const html = renderSite(s, { mode: 'preview', resolveAsset: () => null, demoNotice: null });
  assert.ok(html.includes('artsvg'));
  assert.ok(!html.includes('nao-autorizada'));
  const d = buildDirection({ segment: 'cafe', segmentLabel: 'Cafeteria', name: 'X', hasPhotos: false, hasLogo: false, hasMenu: false, amenities: ['Wi-Fi'] });
  assert.ok(d.photoNote);
  assert.ok(d.audience.some((a) => a.basis === 'indício'));
  assert.ok(d.audience.some((a) => a.basis === 'hipótese'));
});

test('paletas dos conceitos têm contraste legível', () => {
  for (const seg of ['cafe', 'barbershop', 'pizzeria', 'clothing', 'bar', 'pet_shop']) {
    for (const c of ['refined', 'bold', 'inviting'] as const) {
      const t = themeFor(seg, c);
      assert.ok(contrast(t.text, t.background) >= 7, `${seg}/${c} texto`);
      assert.ok(contrast(t.muted, t.background) >= 4.5, `${seg}/${c} secundário`);
    }
  }
});

test('avaliação de qualidade aponta falta de contato e de conteúdo', () => {
  const s: SiteSpec = { ...spec, theme: themeFor('cafe', 'inviting') };
  const q = evaluateSite(s, { usableImageIds: [] });
  assert.ok(q.score < 60);
  assert.equal(q.checks.find((c) => c.id === 'contact')!.status, 'fail');
  assert.equal(q.checks.find((c) => c.id === 'content')!.status, 'fail');
});

import { createZip } from '../src/lib/zip.ts';
import { normalizeDomain } from '../src/services/publish.ts';
import { inflateRawSync } from 'node:zlib';

test('zip gerado é válido e preserva o conteúdo', () => {
  const z = createZip([{ name: 'index.html', data: Buffer.from('<h1>olá</h1>') }, { name: 'assets/a.txt', data: Buffer.from('x'.repeat(1000)) }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  const nameLen = z.readUInt16LE(26);
  const compLen = z.readUInt32LE(18);
  assert.equal(inflateRawSync(z.subarray(30 + nameLen, 30 + nameLen + compLen)).toString(), '<h1>olá</h1>');
});

test('normaliza domínios do cliente (raiz x subdomínio)', () => {
  assert.deepEqual(normalizeDomain('https://www.CafeAroma.com.br/'), { domain: 'cafearoma.com.br', kind: 'apex', apex: 'cafearoma.com.br' });
  assert.equal(normalizeDomain('cafe.minhaagencia.com.br').kind, 'subdomain');
  assert.equal(normalizeDomain('barbearia.com').kind, 'apex');
  assert.throws(() => normalizeDomain('não é domínio'));
});

import { evaluateHtml } from '../src/providers/website.ts';
import { dedupePlaces, normalizePhone } from '../src/services/prospecting.ts';
import { isSiteDown } from '../src/services/investigation.ts';
import { dedupeKey } from '../src/repo.ts';

test('qualidade de site existente: sinais verificáveis', () => {
  const old = '<html><head><title>Bar</title></head><body><table width="600" bgcolor="#fff"><tr><td><font>Olá</font></td></tr></table>© 2016 Bar do Zé</body></html>';
  const q = evaluateHtml(old, 'http://bardoze.com.br', new Date('2026-11-10'));
  assert.equal(q.level, 'weak');
  assert.ok(q.issues.some((i) => i.includes('HTTPS')));
  assert.ok(q.issues.some((i) => i.includes('celular')));
  assert.ok(q.issues.some((i) => i.includes('2016')));
  const good = `<html><head><title>Café</title><meta name="viewport" content="width=device-width"><meta name="description" content="x"></head><body>${'conteúdo '.repeat(80)} © 2026</body></html>`;
  assert.equal(evaluateHtml(good, 'https://cafe.com.br', new Date('2026-11-10')).level, 'ok');
});

test('fora do ar só em falhas inequívocas', () => {
  assert.equal(isSiteDown('Falha de conexão com x.com.br: ENOTFOUND'), true);
  assert.equal(isSiteDown('O site respondeu HTTP 404'), true);
  assert.equal(isSiteDown('Tempo esgotado ao acessar x.com.br'), false);
  assert.equal(isSiteDown('O robots.txt do site não permite'), false);
});

test('telefones padronizados', () => {
  assert.equal(normalizePhone('+55 11 3000-0000'), '(11) 3000-0000');
  assert.equal(normalizePhone('11990000000'), '(11) 99000-0000');
  assert.equal(normalizePhone('+55 (11) 99000-0000; +55 11 3000-0000'), '(11) 99000-0000');
});

test('duplicados da mesma busca são unificados', () => {
  const base = { address: {}, provider: 'overpass' as const };
  const r = dedupePlaces([
    { ...base, ref: 'osm:node/1', name: 'Café Aurora', lat: -23.56, lon: -46.69, tags: { name: 'Café Aurora', amenity: 'cafe' } },
    { ...base, ref: 'osm:way/2', name: 'Cafe Aurora', lat: -23.5603, lon: -46.6901, tags: { name: 'Cafe Aurora', amenity: 'cafe', phone: '1130000000' } },
    { ...base, ref: 'osm:node/3', name: 'Café Aurora', lat: -23.6, lon: -46.7, tags: { name: 'Café Aurora' } },
  ]);
  assert.equal(r.places.length, 2); // o terceiro está a ~5 km: outro estabelecimento
  assert.equal(r.merged, 1);
  assert.equal(r.places[0]!.tags.phone, '1130000000');
  assert.equal(dedupeKey('Padaria Bella Ltda'), dedupeKey('BELLA'));
});
