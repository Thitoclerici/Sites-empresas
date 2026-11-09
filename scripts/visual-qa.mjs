// Bancada de avaliação visual: sobe o servidor com um banco temporário, cadastra
// negócios de TESTE (dados fictícios, marcados como "teste"), gera os sites e tira
// capturas reais em desktop e celular. Uso: npm run qa:visual -- [pasta-de-saida]
// Requer o Playwright instalado na máquina (require('playwright')).

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(process.argv[2] ?? 'qa-shots');
const PORT = Number(process.env.QA_PORT ?? 3190 + Math.floor(Math.random() * 600));
const API = `http://127.0.0.1:${PORT}/api`;
mkdirSync(OUT, { recursive: true });

const FIXTURES = [
  {
    slug: 'cafe-sparse',
    business: { name: 'Café Aurora (teste)', segment: 'cafe', street: 'Rua Harmonia', number: '271', suburb: 'Vila Madalena', city: 'São Paulo', state: 'SP' },
    facts: { amenities: ['Wi-Fi', 'Mesas ao ar livre'] },
  },
  {
    slug: 'cafe-full',
    business: { name: 'Grão & Prosa (teste)', segment: 'cafe', street: 'Rua dos Pinheiros', number: '820', suburb: 'Pinheiros', city: 'São Paulo', state: 'SP', phone: '(11) 3000-0000' },
    facts: {
      whatsapp: '(11) 90000-0000',
      opening_hours: 'Mo-Fr 07:30-19:00; Sa 08:00-17:00; Su off',
      description: 'Cafeteria de bairro com cafés especiais preparados na hora, pães de fermentação natural e um salão iluminado para trabalhar ou conversar.',
      differentials: ['Cafés especiais de pequenos produtores', 'Pães de fermentação natural', 'Salão com tomadas para notebook'],
      amenities: ['Wi-Fi', 'Opções veganas', 'Pet friendly'],
      menu: [
        { name: 'Cafés', items: [{ name: 'Espresso', description: 'Curto e encorpado', price: 'R$ 7,00' }, { name: 'Cappuccino', description: 'Leite vaporizado e canela', price: 'R$ 13,00' }, { name: 'Coado V60', description: 'Grão do dia', price: 'R$ 15,00' }, { name: 'Cold brew', description: '12 horas de extração', price: 'R$ 16,00' }] },
        { name: 'Para acompanhar', items: [{ name: 'Pão de queijo', price: 'R$ 6,50' }, { name: 'Croissant de manteiga', price: 'R$ 12,00' }, { name: 'Tostex de queijo e tomate', price: 'R$ 22,00' }] },
      ],
    },
  },
  {
    slug: 'barbearia',
    business: { name: 'Barbearia Navalha (teste)', segment: 'barbershop', street: 'Rua Augusta', number: '1500', suburb: 'Consolação', city: 'São Paulo', state: 'SP', phone: '(11) 3111-1111' },
    facts: {
      whatsapp: '(11) 91111-1111',
      opening_hours: 'Tu-Fr 10:00-20:00; Sa 09:00-18:00',
      differentials: ['Atendimento com hora marcada', 'Toalha quente em todos os serviços'],
      services: [
        { name: 'Corte', description: 'Tesoura e máquina, lavagem inclusa', price: 'R$ 60,00', extra: '45 min' },
        { name: 'Barba', description: 'Navalha e toalha quente', price: 'R$ 45,00', extra: '30 min' },
        { name: 'Corte + barba', description: 'O combo completo', price: 'R$ 95,00', extra: '75 min' },
        { name: 'Pigmentação', price: 'R$ 40,00', extra: '20 min' },
      ],
    },
  },
  {
    slug: 'pizzaria',
    business: { name: 'Forno Bravo Pizzaria (teste)', segment: 'pizzeria', street: 'Rua Teodoro Sampaio', number: '900', suburb: 'Pinheiros', city: 'São Paulo', state: 'SP', phone: '(11) 3222-2222' },
    facts: {
      whatsapp: '(11) 92222-2222',
      opening_hours: 'Tu-Su 18:00-23:30',
      amenities: ['Delivery', 'Para viagem'],
      menu: [
        { name: 'Clássicas', items: [{ name: 'Margherita', description: 'Molho de tomate, muçarela e manjericão', price: 'R$ 62,00' }, { name: 'Calabresa', description: 'Calabresa fatiada e cebola', price: 'R$ 58,00' }, { name: 'Quatro queijos', price: 'R$ 68,00' }] },
        { name: 'Especiais', items: [{ name: 'Pepperoni', price: 'R$ 72,00' }, { name: 'Abobrinha e burrata', price: 'R$ 79,00' }] },
      ],
    },
  },
  {
    slug: 'roupas',
    business: { name: 'Atelier Linho (teste)', segment: 'clothing', street: 'Rua Oscar Freire', number: '400', suburb: 'Jardins', city: 'São Paulo', state: 'SP' },
    facts: {
      whatsapp: '(11) 93333-3333',
      opening_hours: 'Mo-Sa 10:00-19:00',
      products: [{ name: 'Camisas de linho', price: 'a partir de R$ 189' }, { name: 'Vestidos', price: 'a partir de R$ 249' }, { name: 'Calças de alfaiataria', price: 'a partir de R$ 229' }],
    },
  },
];

async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data;
}

const dataDir = mkdtempSync(join(tmpdir(), 'prospecta-qa-'));
const server = spawn('npx', ['tsx', 'server/src/index.ts'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_NO_WARNINGS: '1', LOG_LEVEL: 'warn', HUB_PASSWORD: '', ANTHROPIC_API_KEY: process.env.QA_USE_AI ? process.env.ANTHROPIC_API_KEY : '' }, stdio: 'inherit' });
for (let i = 0; i < 60; i++) {
  try { await fetch(`${API}/health`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const browser = await chromium.launch();
const report = [];
try {
  const concepts = (process.env.QA_CONCEPTS ?? '').split(',').filter(Boolean);
  const only = (process.env.QA_ONLY ?? '').split(',').filter(Boolean);
  for (const fx of FIXTURES.filter((f) => !only.length || only.includes(f.slug))) {
    const b = await api('POST', '/businesses', fx.business);
    for (const [field, value] of Object.entries(fx.facts)) await api('POST', `/businesses/${b.id}/facts`, { field, value });
    const variants = concepts.length ? concepts : [null];
    for (const concept of variants) {
      const { site } = await api('POST', `/businesses/${b.id}/sites`, concept ? { concept } : {});
      const name = concept ? `${fx.slug}-${concept}` : fx.slug;
      const url = `${API}/sites/${site.id}/preview`;
      for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 }]]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile });
        await page.goto(url, { waitUntil: 'networkidle' }).catch(() => undefined);
        await page.waitForTimeout(900);
        await page.screenshot({ path: join(OUT, `${name}-${label}-fold.png`) });
        // rola até o fim para disparar animações de entrada antes da captura completa
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(OUT, `${name}-${label}-full.png`), fullPage: true });
        await page.close();
      }
      const q = await fetch(`${API}/sites/${site.id}/quality`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      report.push({ name, siteId: site.id, quality: q?.score ?? null });
      console.log(`✓ ${name}${q ? ` — qualidade ${q.score}/100` : ''}`);
    }
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
