// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { readDeployment } from '@justtld/shared/deployment';
import { closePool, queryRows } from '@justtld/db';

import { GET as healthGet } from '@/app/api/health/route';
import { GET as zonesGet } from '@/app/api/zones/route';
import { GET as zoneGet } from '@/app/api/zones/[tld]/route';
import { GET as historyGet } from '@/app/api/zones/[tld]/history/route';
import { GET as statsGet } from '@/app/api/stats/route';
import { GET as searchGet } from '@/app/api/search/route';
import { POST as prepareRegistration } from '@/app/api/zones/prepare-registration/route';
import { POST as prepareTransfer } from '@/app/api/zones/prepare-transfer/route';
import { POST as prepareRenewal } from '@/app/api/zones/prepare-renewal/route';
import { POST as adminBlock } from '@/app/api/admin/zones/[tld]/block/route';
import { POST as authNonce } from '@/app/api/auth/nonce/route';
import { POST as authVerify } from '@/app/api/auth/verify/route';
import { GET as devWallets } from '@/app/api/dev/wallets/route';
import { resetRateLimits } from '@/lib/server/rate-limit';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const PRIVATE_KEYS = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  alice: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  bob: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const;
const admin = privateKeyToAccount(PRIVATE_KEYS.admin);
const alice = privateKeyToAccount(PRIVATE_KEYS.alice);
const bob = privateKeyToAccount(PRIVATE_KEYS.bob);

const deployment = (() => {
  try {
    return readDeployment();
  } catch {
    return null;
  }
})();

const chain = deployment
  ? ({
      id: deployment.chainId,
      name: 'local',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] } },
    } as const)
  : null;

const publicClient = createPublicClient({
  transport: http(RPC_URL, { timeout: 4000, retryCount: 0 }),
});

const ready = await (async () => {
  if (!deployment || !chain) return false;
  try {
    await publicClient.getBlockNumber();
    await queryRows('SELECT 1');
    return true;
  } catch {
    return false;
  }
})();

const createdZones: string[] = [];
const BASE = 'http://127.0.0.1:3000';

function apiRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.0.0.1',
      ...(init.headers ?? {}),
    },
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

async function readJson<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Регистрирует зону в контракте и возвращает её имя. */
async function registerOnChain(metadata = '') {
  const tld = `.api-${Math.random().toString(36).slice(2, 7)}`;
  const hash = await createWalletClient({
    account: alice,
    chain: chain!,
    transport: http(RPC_URL),
  }).writeContract({
    address: deployment!.address,
    abi: REGISTRY_ABI,
    functionName: 'registerTLD',
    args: [tld, metadata],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  createdZones.push(tld);
  return tld;
}

/** Полный вход по подписи, как в UI; возвращает cookie и CSRF-токен. */
async function login(account: typeof alice) {
  const nonceResponse = await authNonce(
    apiRequest('/api/auth/nonce', {
      method: 'POST',
      body: JSON.stringify({ address: account.address }),
    }),
  );
  const nonceBody = await readJson<{ nonce: string; message: string }>(nonceResponse);
  const signature = await account.signMessage({ message: nonceBody.message });
  const verifyResponse = await authVerify(
    apiRequest('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ address: account.address, signature, nonce: nonceBody.nonce }),
    }),
  );
  const cookies = (verifyResponse.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  const csrf = /justtld_csrf=([^;]+)/.exec(cookies)?.[1] ?? '';
  return {
    cookies,
    csrf,
    body: await readJson<{ user: { address: string; role: string } }>(verifyResponse),
  };
}

describe.skipIf(!ready)('API JustTLD (реальная сеть + PostgreSQL)', () => {
  afterAll(async () => {
    for (const tld of createdZones) {
      await queryRows('DELETE FROM zones WHERE tld = $1', [tld]).catch(() => undefined);
    }
    await closePool();
  });

  it('GET /api/health отдаёт состояние всех подсистем', async () => {
    const response = await healthGet(apiRequest('/api/health'));
    const body = await readJson<{ status: string; checks: Record<string, { ok: boolean }> }>(
      response,
    );
    expect(response.status).toBe(200);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.checks.database?.ok).toBe(true);
    expect(body.checks.rpc?.ok).toBe(true);
    expect(body.checks.contract?.ok).toBe(true);
  });

  it('GET /api/zones возвращает пагинированный список', async () => {
    const response = await zonesGet(apiRequest('/api/zones?page=1&limit=5'));
    const body = await readJson<{ items: unknown[]; total: number; page: number; limit: number }>(
      response,
    );
    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /api/zones валидирует параметры (Zod → 400)', async () => {
    const response = await zonesGet(apiRequest('/api/zones?limit=99999'));
    expect(response.status).toBe(400);
    const body = await readJson<{ error: { code: string } }>(response);
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('GET /api/zones/:tld отдаёт зону и сверяет с блокчейном', async () => {
    const tld = await registerOnChain('{"api":true}');
    const response = await zoneGet(apiRequest(`/api/zones/${tld}`), context({ tld }));
    const body = await readJson<{
      zone: { ownerAddress: string; tld: string } | null;
      chain: { owner: string } | null;
    }>(response);
    expect(response.status).toBe(200);
    expect(body.chain?.owner).toBe(alice.address.toLowerCase());
    // Кэш может быть ещё не прогрет индексатором — это допустимо, зона читается из контракта.
    if (body.zone) expect(body.zone.ownerAddress).toBe(alice.address.toLowerCase());
  });

  it('GET /api/zones/:tld для неизвестной зоны → 404', async () => {
    const response = await zoneGet(
      apiRequest('/api/zones/.not-registered-x'),
      context({ tld: '.not-registered-x' }),
    );
    expect(response.status).toBe(404);
  });

  it('GET /api/zones/:tld/history отдаёт историю после индексации', async () => {
    const tld = await registerOnChain();
    // Ждём, пока работающий индексатор подхватит событие.
    let status = 0;
    for (let attempt = 0; attempt < 20 && status !== 200; attempt += 1) {
      const response = await historyGet(apiRequest(`/api/zones/${tld}/history`), context({ tld }));
      status = response.status;
      if (status === 200) {
        const body = await readJson<{ items: Array<{ eventType: string }>; total: number }>(
          response,
        );
        expect(body.total).toBeGreaterThanOrEqual(1);
        expect(body.items[0]?.eventType).toBe('registered');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    expect(status).toBe(200);
  });

  it('GET /api/stats возвращает агрегаты', async () => {
    const response = await statsGet(apiRequest('/api/stats'));
    const body = await readJson<{ total: number; active: number; totalEvents: number }>(response);
    expect(response.status).toBe(200);
    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(body.totalEvents).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/search находит зону и сообщает доступность', async () => {
    const tld = await registerOnChain();
    const found = await searchGet(apiRequest(`/api/search?q=${encodeURIComponent(tld)}`));
    const foundBody = await readJson<{ availability: { available: boolean; reason: string } }>(
      found,
    );
    expect(found.status).toBe(200);
    expect(foundBody.availability.available).toBe(false);
    expect(foundBody.availability.reason).toBe('TLD_ALREADY_EXISTS');

    const free = await searchGet(apiRequest('/api/search?q=.free-name-for-search'));
    const freeBody = await readJson<{ availability: { available: boolean } }>(free);
    expect(freeBody.availability.available).toBe(true);
  });

  it('POST /api/zones/prepare-registration возвращает неподписанную tx', async () => {
    const tld = `.prep-${Math.random().toString(36).slice(2, 7)}`;
    const response = await prepareRegistration(
      apiRequest('/api/zones/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld, metadata: 'prep', sender: alice.address }),
      }),
    );
    const body = await readJson<{
      tx: { to: string; data: string; chainId: number };
      intentId: string;
    }>(response);
    expect(response.status).toBe(201);
    expect(body.tx.to.toLowerCase()).toBe(deployment!.address.toLowerCase());
    expect(body.tx.data.startsWith('0x')).toBe(true);
    expect(body.tx.chainId).toBe(deployment!.chainId);
    expect(body.intentId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /api/zones/prepare-registration отклоняет невалидную и занятую зону', async () => {
    const invalid = await prepareRegistration(
      apiRequest('/api/zones/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld: '.a', metadata: '', sender: alice.address }),
      }),
    );
    expect(invalid.status).toBe(400);

    const takenTld = await registerOnChain();
    const duplicate = await prepareRegistration(
      apiRequest('/api/zones/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld: takenTld, metadata: '', sender: bob.address }),
      }),
    );
    const body = await readJson<{ error: { code: string } }>(duplicate);
    expect(duplicate.status).toBe(409);
    expect(body.error.code).toBe('TLD_ALREADY_EXISTS');
  });

  it('POST /api/zones/prepare-transfer: владельцу можно, чужому — 403', async () => {
    const tld = await registerOnChain();
    const foreign = await prepareTransfer(
      apiRequest('/api/zones/prepare-transfer', {
        method: 'POST',
        body: JSON.stringify({ tld, to: alice.address, sender: bob.address }),
      }),
    );
    const foreignBody = await readJson<{ error: { code: string } }>(foreign);
    expect(foreign.status).toBe(403);
    expect(foreignBody.error.code).toBe('FORBIDDEN');

    const owner = await prepareTransfer(
      apiRequest('/api/zones/prepare-transfer', {
        method: 'POST',
        body: JSON.stringify({ tld, to: bob.address, sender: alice.address }),
      }),
    );
    const ownerBody = await readJson<{ tx: unknown; transferRequestId: string | null }>(owner);
    expect(owner.status).toBe(201);
    expect(ownerBody.tx).toBeTruthy();
  });

  it('POST /api/zones/prepare-renewal: чужую зону продлить нельзя', async () => {
    const tld = await registerOnChain();
    const response = await prepareRenewal(
      apiRequest('/api/zones/prepare-renewal', {
        method: 'POST',
        body: JSON.stringify({ tld, sender: bob.address }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it('админ-эндпоинт без сессии → 401', async () => {
    const response = await adminBlock(
      apiRequest('/api/admin/zones/.whatever/block', {
        method: 'POST',
        body: JSON.stringify({ reason: 'test' }),
      }),
      context({ tld: '.whatever' }),
    );
    expect(response.status).toBe(401);
  });

  it('админ-эндпоинт с сессией обычного пользователя → 403', async () => {
    const session = await login(alice);
    const response = await adminBlock(
      apiRequest('/api/admin/zones/.whatever/block', {
        method: 'POST',
        headers: { cookie: session.cookies, 'x-csrf-token': session.csrf },
        body: JSON.stringify({ reason: 'test' }),
      }),
      context({ tld: '.whatever' }),
    );
    expect(response.status).toBe(403);
  });

  it('админ блокирует зону без CSRF-токена → 403 (CSRF)', async () => {
    const session = await login(admin);
    const tld = await registerOnChain();
    const response = await adminBlock(
      apiRequest(`/api/admin/zones/${tld}/block`, {
        method: 'POST',
        headers: { cookie: session.cookies },
        body: JSON.stringify({ reason: 'no csrf' }),
      }),
      context({ tld }),
    );
    expect(response.status).toBe(403);
  });

  it('админ с валидной сессией и CSRF получает tx блокировки и аудит', async () => {
    const session = await login(admin);
    const tld = await registerOnChain();
    const response = await adminBlock(
      apiRequest(`/api/admin/zones/${tld}/block`, {
        method: 'POST',
        headers: { cookie: session.cookies, 'x-csrf-token': session.csrf },
        body: JSON.stringify({ reason: 'policy violation' }),
      }),
      context({ tld }),
    );
    const body = await readJson<{ tx: { to: string }; auditId: string }>(response);
    expect(response.status).toBe(201);
    expect(body.tx.to.toLowerCase()).toBe(deployment!.address.toLowerCase());
    expect(body.auditId).toMatch(/^[0-9a-f-]{36}$/);

    const audit = await queryRows<{ action: string; target: string; outcome: string }>(
      'SELECT action, target, outcome FROM admin_audit_log WHERE id = $1',
      [body.auditId],
    );
    expect(audit[0]?.action).toBe('block');
    expect(audit[0]?.target).toBe(tld);
    expect(audit[0]?.outcome).toBe('success');
  });

  it('запрос с чужим Origin отклоняется (CSRF)', async () => {
    const response = await prepareRegistration(
      new Request(`${BASE}/api/zones/prepare-registration`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          host: '127.0.0.1:3000',
          'x-forwarded-for': '10.0.0.2',
        },
        body: JSON.stringify({
          tld: `.csrf-${Math.random().toString(36).slice(2, 6)}`,
          sender: alice.address,
        }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it('rate limiting отдаёт 429 после превышения лимита', async () => {
    resetRateLimits();
    const results: number[] = [];
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await authNonce(
        new Request(`${BASE}/api/auth/nonce`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '10.9.9.9',
            'x-real-ip': '10.9.9.9',
          },
          body: JSON.stringify({ address: alice.address }),
        }),
      );
      results.push(response.status);
    }
    expect(results).toContain(429);
    expect(results.filter((status) => status === 200).length).toBeLessThanOrEqual(10);
  });

  it('GET /api/dev/wallets отдаёт тестовые аккаунты только в dev-режиме', async () => {
    const response = await devWallets(apiRequest('/api/dev/wallets'));
    if (response.status === 200) {
      const body = await readJson<{ accounts: Array<{ address: string }> }>(response);
      expect(body.accounts.length).toBeGreaterThan(0);
    } else {
      expect(response.status).toBe(403);
    }
  });
});
