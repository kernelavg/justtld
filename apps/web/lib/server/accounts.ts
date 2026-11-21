import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@justtld/shared';
import { createAccount, getAccountWithPasswordByEmail } from '@justtld/db';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString(
    'hex',
  );
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hex] = parts;
  if (!salt || !hex) return false;
  const derived = scryptSync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const target = Buffer.from(hex, 'hex');
  if (derived.length !== target.length) return false;
  return timingSafeEqual(derived, target);
}

/** Детерминированный внутренний EVM-идентификатор для email-аккаунтов (без MetaMask). */
function generateVirtualAddress(email: string): string {
  const digest = createHash('sha256')
    .update(`justtld-account:${email.toLowerCase()}:${randomBytes(16).toString('hex')}`)
    .digest('hex');
  return `0x${digest.slice(0, 40)}`;
}

export async function registerEmailAccount(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const existing = await getAccountWithPasswordByEmail(input.email);
  if (existing) {
    throw new ApiError(409, 'EMAIL_EXISTS', 'Аккаунт с этим email уже зарегистрирован');
  }
  const passwordHash = hashPassword(input.password);
  const walletAddress = generateVirtualAddress(input.email);
  return createAccount({
    email: input.email,
    passwordHash,
    walletAddress,
    displayName: input.displayName ?? null,
  });
}

export async function authenticateEmailAccount(email: string, password: string) {
  const account = await getAccountWithPasswordByEmail(email);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }
  return {
    id: account.id,
    email: account.email,
    walletAddress: account.walletAddress,
    displayName: account.displayName,
    createdAt: account.createdAt,
  };
}

export async function upsertGoogleAccount(input: {
  email: string;
  displayName?: string | null;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await getAccountWithPasswordByEmail(normalizedEmail);
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      walletAddress: existing.walletAddress,
      displayName: existing.displayName ?? input.displayName ?? null,
      createdAt: existing.createdAt,
    };
  }
  const passwordHash = hashPassword(randomBytes(32).toString('hex'));
  const walletAddress = generateVirtualAddress(normalizedEmail);
  return createAccount({
    email: normalizedEmail,
    passwordHash,
    walletAddress,
    displayName: input.displayName?.trim() || null,
  });
}
