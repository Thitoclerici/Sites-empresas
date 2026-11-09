// Conversão do formato opening_hours (OSM) para linhas legíveis em português.
// Cobre os padrões mais comuns; formatos complexos retornam null (exibe o texto original).

const DAYS: Record<string, string> = { Mo: 'Seg', Tu: 'Ter', We: 'Qua', Th: 'Qui', Fr: 'Sex', Sa: 'Sáb', Su: 'Dom', PH: 'Feriados' };
const DAY_FULL: Record<string, string> = { Mo: 'Segunda', Tu: 'Terça', We: 'Quarta', Th: 'Quinta', Fr: 'Sexta', Sa: 'Sábado', Su: 'Domingo', PH: 'Feriados' };

export interface HoursRow {
  days: string;
  hours: string;
}

function daysLabel(spec: string): string | null {
  const parts = spec.split(',').map((p) => p.trim());
  const out: string[] = [];
  for (const p of parts) {
    const range = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su|PH)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (range) {
      out.push(`${DAY_FULL[range[1]!]} a ${DAY_FULL[range[2]!]}`);
      continue;
    }
    if (DAYS[p]) {
      out.push(DAY_FULL[p]!);
      continue;
    }
    return null;
  }
  return out.join(', ');
}

export function parseOpeningHours(raw?: string): HoursRow[] | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === '24/7') return [{ days: 'Todos os dias', hours: '24 horas' }];
  const rows: HoursRow[] = [];
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)\s+(.+)$/);
    if (!m) {
      // Sem dias = vale para todos os dias (ex.: "08:00-18:00").
      if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(rule)) {
        rows.push({ days: 'Todos os dias', hours: rule.replace(/\s*-\s*/g, ' às ').replace(/,\s*/g, ' e ') });
        continue;
      }
      return null;
    }
    const days = daysLabel(m[1]!.trim().replace(/,$/, ''));
    if (!days) return null;
    const times = m[2]!.trim();
    if (/^off|closed$/i.test(times)) {
      rows.push({ days, hours: 'Fechado' });
      continue;
    }
    if (!/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*\+?$/.test(times)) return null;
    rows.push({ days, hours: times.replace(/\s*-\s*/g, ' às ').replace(/\s*,\s*/g, ' e ') });
  }
  return rows.length ? rows : null;
}

/** Linhas a partir das descrições do Google ("segunda-feira: 08:00–18:00"). */
export function rowsFromGoogle(lines?: string[]): HoursRow[] | null {
  if (!lines?.length) return null;
  return lines.map((l) => {
    const [d, ...rest] = l.split(':');
    const day = (d ?? '').trim();
    return { days: day.charAt(0).toUpperCase() + day.slice(1), hours: rest.join(':').trim() };
  });
}
