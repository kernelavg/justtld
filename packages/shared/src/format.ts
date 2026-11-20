export type Language = 'ru' | 'en';

export function shortenAddress(address: string | null | undefined, size = 4): string {
  if (!address) return '—';
  if (address.length <= 2 + size * 2) return address;
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function formatDateTime(
  iso: string | number | Date | null | undefined,
  language: Language = 'ru',
): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(typeof iso === 'number' ? iso * 1000 : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDate(
  iso: string | number | Date | null | undefined,
  language: Language = 'ru',
): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(typeof iso === 'number' ? iso * 1000 : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

export function daysUntil(
  iso: string | number | Date | null | undefined,
  from = Date.now(),
): number {
  if (!iso) return 0;
  const date = iso instanceof Date ? iso : new Date(typeof iso === 'number' ? iso * 1000 : iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.ceil((date.getTime() - from) / 86_400_000);
}

export function pluralizeDays(days: number, language: Language = 'ru'): string {
  const abs = Math.abs(days);
  if (language === 'en') return `${abs} ${abs === 1 ? 'day' : 'days'}`;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${abs} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${abs} дня`;
  return `${abs} дней`;
}

export function shortHash(hash: string | null | undefined, size = 6): string {
  if (!hash) return '—';
  return `${hash.slice(0, 2 + size)}…${hash.slice(-size)}`;
}

export function formatNumber(value: number, language: Language = 'ru'): string {
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(value);
}
