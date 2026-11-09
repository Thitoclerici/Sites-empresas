// Extração de cores predominantes de uma imagem (logotipo), no navegador.

export async function extractPalette(url: string, count = 4): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const size = 96;
  const canvas = document.createElement('canvas');
  const ratio = Math.min(size / img.width, size / img.height, 1);
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 230) continue; // quase branco
    if (max < 18) continue; // quase preto
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  const sorted = [...buckets.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .map((c) => ({ ...c, sat: (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255 }))
    .sort((a, b) => b.n * (0.4 + b.sat) - a.n * (0.4 + a.sat));
  const out: { r: number; g: number; b: number }[] = [];
  for (const c of sorted) {
    if (out.every((o) => Math.abs(o.r - c.r) + Math.abs(o.g - c.g) + Math.abs(o.b - c.b) > 90)) out.push(c);
    if (out.length >= count) break;
  }
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return out.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase());
}
