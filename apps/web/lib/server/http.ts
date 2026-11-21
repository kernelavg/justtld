import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from '@justtld/shared';
import { rateLimits } from './config';
import { checkRateLimit, rateLimitHeaders } from './rate-limit';

export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const pairs: Array<[string, string]> = Object.entries(JSON_HEADERS) as Array<[string, string]>;
  const input = init.headers;

  if (input instanceof Headers) {
    for (const [key, value] of input.entries()) {
      if (key.toLowerCase() !== 'set-cookie') pairs.push([key, value]);
    }
    // Set-Cookie нельзя склеивать в одну строку — добавляем отдельными парами.
    const cookies = typeof input.getSetCookie === 'function' ? input.getSetCookie() : [];
    for (const cookie of cookies) pairs.push(['set-cookie', cookie]);
  } else if (Array.isArray(input)) {
    for (const [key, value] of input) pairs.push([String(key), String(value)]);
  } else if (input) {
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') pairs.push([key, value]);
    }
  }

  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers: pairs });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = { ...JSON_HEADERS };
    const details = error.details as { retryAfterSeconds?: number } | undefined;
    if (error.status === 429 && details?.retryAfterSeconds) {
      headers['Retry-After'] = String(details.retryAfterSeconds);
    }
    return new Response(JSON.stringify(error.toBody()), { status: error.status, headers });
  }

  if (error instanceof ZodError) {
    const body = ApiError.badRequest('INVALID_INPUT', 'Некорректные данные запроса', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
    return new Response(JSON.stringify(body.toBody()), { status: 400, headers: JSON_HEADERS });
  }

  const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error('[api] необработанная ошибка:', error);
  const body = ApiError.internal(
    process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : message,
  );
  return new Response(JSON.stringify(body.toBody()), { status: 500, headers: JSON_HEADERS });
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Проверка Origin/Referer для мутирующих запросов (защита от CSRF). */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin) {
    // Клиенты без Origin (curl, сервер-сервер) допускаются, но требуют явный JSON-контент.
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') || contentType === '') return;
    throw ApiError.forbidden('CSRF: отсутствует Origin и неверный Content-Type');
  }
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw ApiError.forbidden('CSRF: запрос с чужого origin отклонён');
    }
  } catch {
    throw ApiError.forbidden('CSRF: некорректный Origin');
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function readJson<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw ApiError.badRequest('INVALID_JSON', 'Тело запроса должно быть валидным JSON');
  }
  return schema.parse(payload);
}

export function readQuery<S extends ZodTypeAny>(request: Request, schema: S): z.infer<S> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) raw[key] = value;
  return schema.parse(raw);
}

export type RateLimitKind = 'read' | 'write' | 'auth' | 'admin';

export type RouteOptions = {
  limit?: RateLimitKind;
  /** Дополнительный сегмент ключа (например, имя маршрута). */
  bucket?: string;
  /** Отключает проверку Origin/Content-Type (для внешних платежных webhook'ов). */
  skipOriginCheck?: boolean;
};

type Handler = (request: Request, context?: unknown) => Promise<Response>;

/** Обёртка маршрута: rate limit → CSRF → обработка ошибок. Контекст Next передаётся как есть. */
export function route(handler: Handler, options: RouteOptions = {}): Handler {
  return async (request: Request, context?: unknown) => {
    try {
      const ip = getClientIp(request);
      const kind = options.limit ?? 'read';
      const limit = rateLimits()[kind];
      const bucket = options.bucket ?? `${kind}:${new URL(request.url).pathname}`;
      const result = checkRateLimit(`${ip}:${bucket}`, limit);
      if (!result.ok) {
        return new Response(
          JSON.stringify(
            ApiError.tooManyRequests(
              'Слишком много запросов, попробуйте позже',
              result.retryAfterSeconds,
            ).toBody(),
          ),
          { status: 429, headers: { ...JSON_HEADERS, ...rateLimitHeaders(result) } },
        );
      }

      if (!options.skipOriginCheck) assertSameOrigin(request);

      const response = await handler(request, context);
      for (const [key, value] of Object.entries(rateLimitHeaders(result))) {
        if (!response.headers.has(key)) response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
