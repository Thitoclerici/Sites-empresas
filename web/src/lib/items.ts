// Formato de texto simples para cadastrar cardápio/serviços/produtos rapidamente.
//   # Categoria
//   Nome | descrição | preço | extra (duração, tamanho...)
import type { Item, ItemGroup } from '../../../shared/site.ts';

export function parseGroups(text: string): ItemGroup[] {
  const groups: ItemGroup[] = [];
  let cur: ItemGroup | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      cur = { name: line.replace(/^#+/, '').trim(), items: [] };
      groups.push(cur);
      continue;
    }
    if (!cur) {
      cur = { name: '', items: [] };
      groups.push(cur);
    }
    cur.items.push(parseItem(line));
  }
  return groups.filter((g) => g.items.length);
}

export function parseItem(line: string): Item {
  const [name, description, price, extra] = line.split('|').map((s) => s.trim());
  const it: Item = { name: name ?? '' };
  if (description) it.description = description;
  if (price) it.price = normalizePrice(price);
  if (extra) it.extra = extra;
  return it;
}

export function parseItems(text: string): Item[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(parseItem);
}

function normalizePrice(p: string) {
  if (/^\d+([.,]\d{1,2})?$/.test(p)) return `R$ ${Number(p.replace(',', '.')).toFixed(2).replace('.', ',')}`;
  return p;
}

const itemLine = (i: Item) => [i.name, i.description ?? '', i.price ?? '', i.extra ?? ''].join(' | ').replace(/( \| )+$/, '');
export const groupsToText = (g: ItemGroup[] = []) => g.map((x) => `${x.name ? `# ${x.name}\n` : ''}${x.items.map(itemLine).join('\n')}`).join('\n\n');
export const itemsToText = (items: Item[] = []) => items.map(itemLine).join('\n');
