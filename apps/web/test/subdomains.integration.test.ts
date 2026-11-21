// @vitest-environment node
/**
 * Сквозные интеграционные тесты API поддоменов против реального EVM (Hardhat) и PostgreSQL.
 * Пропускаются автоматически, если не подняты локальная сеть и база (как в api.test.ts).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { readDeployment, tryReadSubdomainsDeployment } from '@justtld/shared/deployment';
import { closePool, queryRows } from '@justtld/db';

import { GET as listSubdomains } from '@/app/api/zones/[tld]/subdomains/route';
import { GET as getSubdomain } from '@/app/api/zones/[tld]/subdomains/[label]/route';
import { POST as prepareSubdomainRegistration } from '@/app/api/subdomains/prepare-registration/route';
import { POST as prepareSubdomainMetadata } from '@/app/api/subdomains/prepare-metadata/route';
import { POST as prepareSubdomainTransfer } from '@/app/api/subdomains/prepare-transfer/route';
import { POST as prepareSubdomainRenewal } from '@/app/api/subdomains/prepare-renewal/route';
import { resetRateLimits } from '@/lib/server/rate-limit';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const PRIVATE_KEYS = {
  alice: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  bob: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const;
const alice = privateKeyToAccount(PRIVATE_KEYS.alice);
const bob = privateKeyToAccount(PRIVATE_KEYS.bob);

const deployment = (() => {
  try {
    return readDeployment();
  } catch {
    return null;
  }
})();
const subdomains = tryReadSubdomainsDeployment();

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
  if (!deployment || !subdomains || !chain) return false;
  if (subdomains.chainId !== deployment.chainId) return false;
  try {
    const [regCode, subCode] = await Promise.all([
      publicClient.getCode({ address: deployment.address }),
      publicClient.getCode({ address: subdomains.address }),
      queryRows('SELECT 1'),
    ]);
    return Boolean(regCode && regCode !== '0x' && subCode && subCode !== '0x');
  } catch {
    return false;
  }
})();

const BASE = 'http://127.0.0.1:3000';
const createdTlds: string[] = [];

function apiRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.0.0.42',
      ...(init.headers ?? {}),
    },
  });
}

function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

async function readJson<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function registerZoneOnChain() {
  const tld = `.subint-${Math.random().toString(36).slice(2, 7)}`;
  const hash = await createWalletClient({
    account: alice,
    chain: chain!,
    transport: http(RPC_URL),
  }).writeContract({
    address: deployment!.address,
    abi: REGISTRY_ABI,
    functionName: 'registerTLD',
    args: [tld, '{"integration":true}'],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  createdTlds.push(tld);
  return tld;
}

async function sendPreparedTx(
  account: typeof alice,
  tx: { to: `0x${string}`; data: `0x${string}`; value?: string },
) {
  const wallet = createWalletClient({ account, chain: chain!, transport: http(RPC_URL) });
  const hash = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value ?? '0'),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
}

describe.skipIf(!ready)('API поддоменов (реальная сеть + PostgreSQL)', () => {
  afterAll(async () => {
    for (const tld of createdTlds) {
      await queryRows('DELETE FROM tx_intents WHERE tld = $1', [tld]).catch(() => undefined);
    }
    await closePool();
  });

  it('полный цикл: подготовка, исполнение calldata в контракте, чтение, дубликат, метаданные и передача', async () => {
    resetRateLimits();
    const tld = await registerZoneOnChain();

    // 1. Чужой пользователь не может зарегистрировать поддомен в зоне alice.
    const strangerAttempt = await prepareSubdomainRegistration(
      apiRequest('/api/subdomains/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', metadata: '', sender: bob.address }),
      }),
    );
    expect(strangerAttempt.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(strangerAttempt)).error.code).toBe(
      'NOT_ZONE_OWNER',
    );

    // 2. Владелец получает готовую транзакцию и intent.
    const initialMeta = JSON.stringify({ url: 'https://blog.example.com' });
    const prepReg = await prepareSubdomainRegistration(
      apiRequest('/api/subdomains/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', metadata: initialMeta, sender: alice.address }),
      }),
    );
    expect(prepReg.status).toBe(201);
    const regBody = await readJson<{
      tx: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
      intentId: string;
      contract: string;
    }>(prepReg);
    expect(regBody.contract.toLowerCase()).toBe(subdomains!.address.toLowerCase());
    expect(regBody.tx.chainId).toBe(deployment!.chainId);

    const intents = await queryRows<{ action: string; tld: string }>(
      'SELECT action, tld FROM tx_intents WHERE id = $1',
      [regBody.intentId],
    );
    expect(intents[0]).toMatchObject({ action: 'subdomain-register', tld });

    // 3. Отправляем полученную calldata напрямую в Hardhat EVM.
    await sendPreparedTx(alice, regBody.tx);

    // 4. Читаем поддомен через GET /api/zones/:tld/subdomains/blog (без прогрева индексера).
    const detail = await getSubdomain(
      apiRequest(`/api/zones/${tld}/subdomains/blog`),
      ctx({ tld, label: 'blog' }),
    );
    expect(detail.status).toBe(200);
    const detailBody = await readJson<{
      subdomain: { name: string; ownerAddress: string; metadata: string } | null;
      chain: { name: string; ownerAddress: string; metadata: string } | null;
    }>(detail);
    expect(detailBody.chain?.ownerAddress).toBe(alice.address.toLowerCase());
    expect(detailBody.chain?.metadata).toBe(initialMeta);

    // 5. Повторная регистрация той же метки → 409 SUBDOMAIN_TAKEN.
    const dup = await prepareSubdomainRegistration(
      apiRequest('/api/subdomains/prepare-registration', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', metadata: '', sender: alice.address }),
      }),
    );
    expect(dup.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(dup)).error.code).toBe('SUBDOMAIN_TAKEN');

    // 6. Обновление метаданных и продление от имени владельца.
    const nextMeta = JSON.stringify({ url: 'https://v2.example.com' });
    const prepMeta = await prepareSubdomainMetadata(
      apiRequest('/api/subdomains/prepare-metadata', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', metadata: nextMeta, sender: alice.address }),
      }),
    );
    expect(prepMeta.status).toBe(201);
    await sendPreparedTx(alice, (await readJson<{ tx: typeof regBody.tx }>(prepMeta)).tx);

    const afterMeta = await getSubdomain(
      apiRequest(`/api/zones/${tld}/subdomains/blog`),
      ctx({ tld, label: 'blog' }),
    );
    expect((await readJson<typeof detailBody>(afterMeta)).chain?.metadata).toBe(nextMeta);

    // 6а. Продлевать свежий поддомен дальше срока зоны нельзя → 409 SubdomainBeyondZone.
    const renewTooEarly = await prepareSubdomainRenewal(
      apiRequest('/api/subdomains/prepare-renewal', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', sender: alice.address }),
      }),
    );
    expect(renewTooEarly.status).toBe(409);
    expect((await readJson<{ error: { code: string } }>(renewTooEarly)).error.code).toBe(
      'SUBDOMAIN_BEYOND_ZONE',
    );

    // 6б. После продления зоны поддомен успешно продлевается.
    const renewZoneHash = await createWalletClient({
      account: alice,
      chain: chain!,
      transport: http(RPC_URL),
    }).writeContract({
      address: deployment!.address,
      abi: REGISTRY_ABI,
      functionName: 'renewTLD',
      args: [tld],
    });
    await publicClient.waitForTransactionReceipt({ hash: renewZoneHash });

    const prepRenew = await prepareSubdomainRenewal(
      apiRequest('/api/subdomains/prepare-renewal', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', sender: alice.address }),
      }),
    );
    expect(prepRenew.status).toBe(201);
    await sendPreparedTx(alice, (await readJson<{ tx: typeof regBody.tx }>(prepRenew)).tx);

    // 7. Передача поддомена другому владельцу и проверка через API.
    const prepTransfer = await prepareSubdomainTransfer(
      apiRequest('/api/subdomains/prepare-transfer', {
        method: 'POST',
        body: JSON.stringify({ tld, label: 'blog', to: bob.address, sender: alice.address }),
      }),
    );
    expect(prepTransfer.status).toBe(201);
    await sendPreparedTx(alice, (await readJson<{ tx: typeof regBody.tx }>(prepTransfer)).tx);

    const afterTransfer = await getSubdomain(
      apiRequest(`/api/zones/${tld}/subdomains/blog`),
      ctx({ tld, label: 'blog' }),
    );
    expect((await readJson<typeof detailBody>(afterTransfer)).chain?.ownerAddress).toBe(
      bob.address.toLowerCase(),
    );

    // 8. Список поддоменов зоны отвечает 200 с корректной структурой.
    const listRes = await listSubdomains(
      apiRequest(`/api/zones/${tld}/subdomains?page=1&limit=10`),
      ctx({ tld }),
    );
    expect(listRes.status).toBe(200);
    expect((await readJson<{ tld: string; pages: number }>(listRes)).tld).toBe(tld);
  });
});
