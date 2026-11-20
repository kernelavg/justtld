/**
 * Правила валидации TLD — единый источник истины для UI и API.
 * Полностью повторяют `_tryNormalize()` из JustTLDRegistry.sol.
 */

export const TLD_MIN_LENGTH = 3;
export const TLD_MAX_LENGTH = 21;
export const TLD_LABEL_PATTERN = /^[a-z0-9-]{2,19}$/;
export const METADATA_MAX_LENGTH = 512;
export const REGISTRATION_PERIOD_DAYS = 365;
export const GRACE_PERIOD_DAYS = 30;

/** Встроенный список зарезервированных зон (совпадает с контрактом). */
export const BUILTIN_RESERVED_TLDS = [
  '.eth',
  '.com',
  '.net',
  '.org',
  '.gov',
  '.edu',
  '.io',
  '.ai',
  '.sol',
  '.local',
] as const;

export type TldIssueCode =
  | 'TLD_EMPTY'
  | 'TLD_LENGTH'
  | 'TLD_MUST_START_WITH_DOT'
  | 'TLD_INVALID_CHARACTER'
  | 'TLD_HYPHEN_EDGE'
  | 'TLD_DOUBLE_HYPHEN'
  | 'TLD_RESERVED'
  | 'TLD_BLACKLISTED'
  | 'TLD_ALREADY_EXISTS'
  | 'CONTRACT_PAUSED';

export const TLD_ISSUE_MESSAGES: Record<TldIssueCode | 'UNKNOWN', { ru: string; en: string }> = {
  TLD_EMPTY: { ru: 'Зона не может быть пустой', en: 'Zone cannot be empty' },
  TLD_LENGTH: {
    ru: 'Длина зоны должна быть от 3 до 21 символа вместе с точкой',
    en: 'Zone length must be between 3 and 21 characters including the dot',
  },
  TLD_MUST_START_WITH_DOT: {
    ru: 'Зона должна начинаться с точки, например .myzone',
    en: 'Zone must start with a dot, e.g. .myzone',
  },
  TLD_INVALID_CHARACTER: {
    ru: 'Разрешены только латинские буквы a-z, цифры 0-9 и дефис',
    en: 'Only a-z, 0-9 and hyphen are allowed',
  },
  TLD_HYPHEN_EDGE: {
    ru: 'Зона не может начинаться или заканчиваться дефисом',
    en: 'Zone cannot start or end with a hyphen',
  },
  TLD_DOUBLE_HYPHEN: {
    ru: 'Два дефиса подряд запрещены',
    en: 'Double hyphens are not allowed',
  },
  TLD_RESERVED: {
    ru: 'Эта зона зарезервирована системой',
    en: 'This zone is reserved by the system',
  },
  TLD_BLACKLISTED: {
    ru: 'Название запрещено политикой реестра',
    en: 'This name is blocked by registry policy',
  },
  TLD_ALREADY_EXISTS: { ru: 'Зона уже зарегистрирована', en: 'Zone is already registered' },
  CONTRACT_PAUSED: {
    ru: 'Реестр на паузе: регистрация временно недоступна',
    en: 'Registry is paused: registration is temporarily unavailable',
  },
  UNKNOWN: { ru: 'Неизвестная ошибка валидации', en: 'Unknown validation error' },
};

export type TldValidation = {
  ok: boolean;
  /** Нормализованное значение (нижний регистр, с точкой). */
  value: string;
  /** Код первой проблемы, если ok === false. */
  code: TldIssueCode | null;
  message: { ru: string; en: string } | null;
};

/**
 * Нормализует пользовательский ввод в канонический вид: убирает пробелы,
 * добавляет точку, приводит к нижнему регистру. Не валидирует.
 */
export function normalizeTld(input: string): string {
  let value = (input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (value.startsWith('.')) {
    value = `.${value.slice(1)}`;
  } else if (value.length > 0) {
    value = `.${value}`;
  }
  return value.replace(/\.{2,}/g, '.');
}

export function isReservedTld(value: string): boolean {
  return (BUILTIN_RESERVED_TLDS as readonly string[]).includes(normalizeTld(value));
}

export function validateTldFormat(input: string): TldValidation {
  const value = normalizeTld(input);
  const fail = (code: TldIssueCode): TldValidation => ({
    ok: false,
    value,
    code,
    message: TLD_ISSUE_MESSAGES[code],
  });

  if (!value || value === '.') return fail('TLD_EMPTY');
  if (!value.startsWith('.')) return fail('TLD_MUST_START_WITH_DOT');
  if (value.length < TLD_MIN_LENGTH || value.length > TLD_MAX_LENGTH) return fail('TLD_LENGTH');

  const label = value.slice(1);
  if (!/^[a-z0-9-]+$/.test(label)) return fail('TLD_INVALID_CHARACTER');
  if (label.startsWith('-') || label.endsWith('-')) return fail('TLD_HYPHEN_EDGE');
  if (label.includes('--')) return fail('TLD_DOUBLE_HYPHEN');

  return { ok: true, value, code: null, message: null };
}

/** Полная локальная проверка (формат + встроенные резервы). */
export function validateTld(input: string): TldValidation {
  const format = validateTldFormat(input);
  if (!format.ok) return format;
  if (isReservedTld(format.value)) {
    return {
      ok: false,
      value: format.value,
      code: 'TLD_RESERVED',
      message: TLD_ISSUE_MESSAGES.TLD_RESERVED,
    };
  }
  return format;
}

export function describeTldIssue(
  code: string | null | undefined,
  language: 'ru' | 'en' = 'ru',
): string {
  const key = (code ?? 'UNKNOWN') as TldIssueCode | 'UNKNOWN';
  return (TLD_ISSUE_MESSAGES[key] ?? TLD_ISSUE_MESSAGES.UNKNOWN)[language];
}

/** Человекочитаемая причина из контракта: "TLD_LENGTH" → фраза. */
export function describeContractReason(reason: string, language: 'ru' | 'en' = 'ru'): string {
  if (reason in TLD_ISSUE_MESSAGES) {
    return describeTldIssue(reason, language);
  }
  const map: Record<string, string> = {
    TLD_ALREADY_EXISTS: describeTldIssue('TLD_ALREADY_EXISTS', language),
    NotTLDOwner: language === 'ru' ? 'Вы не владелец этой зоны' : 'You are not the zone owner',
    TLDIsBlocked: language === 'ru' ? 'Зона заблокирована администратором' : 'Zone is blocked',
    EnforcedPause: language === 'ru' ? 'Реестр на паузе' : 'Registry is paused',
    MetadataTooLong: language === 'ru' ? 'Метаданные слишком длинные' : 'Metadata is too long',
  };
  return map[reason] ?? reason;
}
