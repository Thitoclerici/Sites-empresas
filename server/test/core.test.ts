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
