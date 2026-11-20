/** Единый формат ошибок API: { error: { code, message, details? } }. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Требуется авторизация') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Недостаточно прав') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Не найдено') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }

  static tooManyRequests(message = 'Слишком много запросов', retryAfterSeconds = 60) {
    return new ApiError(429, 'RATE_LIMITED', message, { retryAfterSeconds });
  }

  static internal(message = 'Внутренняя ошибка сервера') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }

  static serviceUnavailable(message = 'Сервис недоступен') {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message);
  }
}

export const API_ERROR_MESSAGES: Record<string, { ru: string; en: string }> = {
  TLD_TAKEN: { ru: 'Зона уже зарегистрирована', en: 'Zone is already registered' },
  TLD_RESERVED: { ru: 'Зона зарезервирована', en: 'Zone is reserved' },
  TLD_BLACKLISTED: { ru: 'Название запрещено политикой', en: 'Name is blocked by policy' },
  NOT_ZONE_OWNER: { ru: 'Вы не владелец зоны', en: 'You are not the zone owner' },
  ZONE_NOT_FOUND: { ru: 'Зона не найдена', en: 'Zone not found' },
  ZONE_BLOCKED: { ru: 'Зона заблокирована', en: 'Zone is blocked' },
  CONTRACT_PAUSED: { ru: 'Реестр на паузе', en: 'Registry is paused' },
  INVALID_INPUT: { ru: 'Некорректные данные запроса', en: 'Invalid request payload' },
  RATE_LIMITED: { ru: 'Слишком много запросов', en: 'Too many requests' },
  CHAIN_UNAVAILABLE: { ru: 'Блокчейн-узел недоступен', en: 'Blockchain node is unavailable' },
};
