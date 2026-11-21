import { randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { verifyMessage } from 'viem';
import { ApiError, type SessionUser } from '@justtld/shared';
import { consumeAuthNonce, createAuthNonce } from '@justtld/db';
import { adminAddress, chainId, sessionSecret } from './config';
import { readCookie } from './http';

export const SESSION_COOKIE = 'justtld_session';
export const CSRF_COOKIE = 'justtld_csrf';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const NONCE_TTL_SECONDS = 5 * 60;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function buildAuthMessage(params: {
  address: string;
  nonce: string;
  issuedAt: string;
  chain: number;
}): string {
  return [
    'JustTLD — вход в личный кабинет',
    '',
    `Адрес: ${params.address}`,
    `Сеть: ${params.chain}`,
    `Nonce: ${params.nonce}`,
    `Время: ${params.issuedAt}`,
    '',
    'Подпись подтверждает владение адресом и не является транзакцией.',
  ].join('\n');
}

/**
 * Nonce содержит метку времени выдачи (`<epochMs>-<random>`).
 * Благодаря этому сервер может восстановить точный текст подписанного сообщения
 * и не хранить его отдельно — при этом метка времени входит в подпись.
 */
export function encodeNonce(prefix = 'jtl'): string {
  return `${prefix}-${Date.now()}-${randomBytes(12).toString('hex')}`;
}

export function nonceIssuedAt(nonce: string): string | null {
  const match = /^jtl-(\d{10,16})-/.exec(nonce);
  if (!match || !match[1]) return null;
  const epoch = Number(match[1]);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch).toISOString();
}

export async function createNonceFor(address: string): Promise<{
  nonce: string;
  message: string;
  expiresAt: string;
}> {
  const nonce = encodeNonce();
  const issuedAt = nonceIssuedAt(nonce) ?? new Date().toISOString();
  await createAuthNonce({ address, nonce, ttlSeconds: NONCE_TTL_SECONDS });
  return {
    nonce,
    message: buildAuthMessage({ address, nonce, issuedAt, chain: chainId() }),
    expiresAt: new Date(Date.now() + NONCE_TTL_SECONDS * 1000).toISOString(),
  };
}

export type IssuedSession = {
  user: SessionUser;
  sessionToken: string;
  csrfToken: string;
  cookies: string[];
};

export async function issueSession(address: string): Promise<IssuedSession> {
  const normalized = address.toLowerCase();
  const role: SessionUser['role'] = adminAddress() === normalized ? 'admin' : 'user';
  const csrfToken = randomBytes(24).toString('hex');
  const jwt = await new SignJWT({ address: normalized, role, csrf: csrfToken })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('justtld')
    .setAudience('justtld-web')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const base = `Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
  const secure = isProduction() ? '; Secure' : '';
  const cookies = [
    `${SESSION_COOKIE}=${jwt}; HttpOnly; ${base}${secure}`,
    `${CSRF_COOKIE}=${csrfToken}; ${base}${secure}`,
  ];

  return { user: { address: normalized, role }, sessionToken: jwt, csrfToken, cookies };
}

export function clearSessionCookies(): string[] {
  return [
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`,
  ];
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'justtld',
      audience: 'justtld-web',
    });
    const address = typeof payload.address === 'string' ? payload.address.toLowerCase() : null;
    if (!address) return null;
    const role: SessionUser['role'] = adminAddress() === address ? 'admin' : 'user';
    return { address, role };
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Проверка прав администратора: сессия + адрес + CSRF-токен (double submit). */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const session = await getSessionFromRequest(request);
  if (!session) throw ApiError.unauthorized('Требуется вход через кошелёк');
  const admin = adminAddress();
  if (!admin) throw ApiError.serviceUnavailable('Администратор не настроен (ADMIN_ADDRESS)');
  if (session.address !== admin) {
    throw ApiError.forbidden('Админ-панель доступна только владельцу контракта');
  }
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return session;

  const headerToken = request.headers.get('x-csrf-token');
  const cookieToken = readCookie(request, CSRF_COOKIE);
  if (!headerToken || !cookieToken || !safeEqual(headerToken, cookieToken)) {
    throw ApiError.forbidden('CSRF-токен отсутствует или не совпадает');
  }
  return session;
}

/** Проверка подписи personal_sign и одноразового nonce. */
export async function verifyLogin(params: {
  address: string;
  signature: string;
  nonce: string;
}): Promise<SessionUser> {
  const normalized = params.address.toLowerCase();
  const consumed = await consumeAuthNonce(params.nonce, normalized);
  if (!consumed) {
    throw ApiError.unauthorized('Nonce недействителен, истёк или уже использован');
  }

  const issuedAt = nonceIssuedAt(params.nonce);
  if (!issuedAt) {
    throw ApiError.badRequest('INVALID_NONCE', 'Некорректный формат nonce — запросите новый');
  }

  const message = buildAuthMessage({
    address: params.address,
    nonce: params.nonce,
    issuedAt,
    chain: chainId(),
  });

  let valid = false;
  try {
    valid = await verifyMessage({
      address: params.address as `0x${string}`,
      message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    throw ApiError.unauthorized('Подпись не соответствует адресу или сообщению');
  }
  return { address: normalized, role: adminAddress() === normalized ? 'admin' : 'user' };
}
