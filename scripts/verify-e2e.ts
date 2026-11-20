/**
 * JustTLD — сквозная проверка на живой системе.
 *
 * Требует запущенных сервисов: npm run chain, npm run deploy, npm run indexer, npm run dev.
 * Все операции проходят через реальный EVM-узел: скрипт подписывает транзакции
 * тестовыми ключами Hardhat и отправляет их в сеть (никаких моков).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Client as PgClient } from 'pg';

const ROOT = path.resolve(__dirname, '..');
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000';
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://justtld:justtld@127.0.0.1:5432/justtld';

const deployment = JSON.parse(
  readFileSync(path.join(ROOT, 'deployments/localhost.json'), 'utf8'),
) as {
  address: `0x${string}`;
  chainId: number;
  abiHash: string;
};
const artifact = JSON.parse(
  readFileSync(
    path.join(ROOT, 'contracts/artifacts/contracts/JustTLDRegistry.sol/JustTLDRegistry.json'),
    'utf8',
  ),
) as { abi: readonly unknown[] };

const ABI = artifact.abi;
const CONTRACT = deployment.address;
const CHAIN = {
  id: deployment.chainId,
  name: 'JustTLD Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const KEYS = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  alice: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  bob: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const;

const admin = privateKeyToAccount(KEYS.admin);
const alice = privateKeyToAccount(KEYS.alice);
const bob = privateKeyToAccount(KEYS.bob);

const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

let step = 0;
const results: Array<{ name: string; ok: boolean; evidence: string }> = [];

function heading(text: string) {
  console.log(`\n${'─'.repeat(78)}\n${text}\n${'─'.repeat(78)}`);
}

function record(name: string, ok: boolean, evidence: string) {
  step += 1;
  results.push({ name, ok, evidence });
  console.log(`${ok ? '✅' : '❌'} ${step}. ${name}`);
  console.log(`   ${evidence}`);
  if (!ok) throw new Error(`Проверка не пройдена: ${name}`);
}

async function api<T>(
  pathName: string,
  init: RequestInit & { cookies?: string } = {},
): Promise<{
  status: number;
  body: T;
  headers: Headers;
}> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.cookies) headers.set('Cookie', init.cookies);
  const response = await fetch(`${APP_URL}${pathName}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body: body as T, headers: response.headers };
}

/** Собирает cookie-jar из Set-Cookie (Node fetch может не поддерживать getSetCookie). */
function cookieJar(headers: Headers): string {
  const raw: string[] =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
  return raw
    .flatMap((cookie) => cookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/))
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join('; ');
}

async function waitForReceipt(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt;
}

async function sendAs(
  account: typeof alice,
  tx: { to: string; data: string; value?: string },
): Promise<{ hash: Hash; blockNumber: number; gasUsed: string; status: string; logs: unknown[] }> {
  const wallet = createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });
  const hash = await wallet.sendTransaction({
    account,
    chain: CHAIN,
    to: tx.to as `0x${string}`,
    data: tx.data as Hex,
    value: BigInt(tx.value ?? '0'),
  });
  const receipt = await waitForReceipt(hash);
  return {
    hash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    logs: receipt.logs as unknown[],
  };
}

function findEvent(logs: unknown[], eventName: string) {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: ABI,
        data: (log as { data: Hex }).data,
        topics: (log as { topics: [] }).topics,
      });
      if (decoded.eventName === eventName) return decoded;
    } catch {
      /* не наше событие */
    }
  }
  return null;
}

async function waitForIndexer(
  tld: string,
  predicate: (body: unknown) => boolean,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastBody: unknown = null;
  while (Date.now() < deadline) {
    const response = await api<unknown>(`/api/zones/${encodeURIComponent(tld)}`);
    lastBody = response.body;
    if (response.status === 200 && predicate(response.body)) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(
    `Индексатор не успел обработать ${tld} за ${timeoutMs}мс. Последний ответ: ${JSON.stringify(lastBody)}`,
  );
}

async function main() {
  const suffix = Math.random().toString(36).slice(2, 7);
  const tld = `.e2e-${suffix}`;
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();

  heading('JustTLD · сквозная проверка (реальная EVM-сеть + PostgreSQL + API + UI)');
  console.log(`App:      ${APP_URL}`);
  console.log(`RPC:      ${RPC_URL} (chainId ${deployment.chainId})`);
  console.log(`Contract: ${CONTRACT} (abi ${deployment.abiHash})`);
  console.log(`Зона для теста: ${tld}`);

  // 1. Контракт задеплоен
  const code = await publicClient.getCode({ address: CONTRACT });
  record(
    'Контракт задеплоен',
    Boolean(code && code !== '0x'),
    `address=${CONTRACT} codeSize=${code ? (code.length - 2) / 2 : 0} байт, block=${deployment.abiHash ? 'есть артефакт' : '—'}`,
  );

  // 2. Сервисы живы
  const health = await api<{ status: string; checks: Record<string, { ok: boolean }> }>(
    '/api/health',
  );
  record(
    'Health-check приложения, БД, узла и индексатора',
    health.body.status === 'ok' || health.body.status === 'degraded',
    `HTTP ${health.status} (${health.body.status}), checks=${JSON.stringify(
      Object.fromEntries(Object.entries(health.body.checks ?? {}).map(([k, v]) => [k, v.ok])),
    )}`,
  );

  // 3. Кошелёк подключается: вход по подписи (как в UI)
  const nonceResponse = await api<{ nonce: string; message: string }>('/api/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ address: alice.address }),
  });
  const signature = await alice.signMessage({ message: nonceResponse.body.message });
  const verify = await api<{ user: { address: string; role: string } }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ address: alice.address, signature, nonce: nonceResponse.body.nonce }),
  });
  const cookieHeader = cookieJar(verify.headers);
  const csrfToken = /justtld_csrf=([^;]+)/.exec(cookieHeader)?.[1] ?? '';
  record(
    'Кошелёк подключается и подписывает сообщение (EIP-191)',
    verify.status === 200 && verify.body.user.address === alice.address.toLowerCase(),
    `alice=${alice.address} role=${verify.body.user.role} sessionCookie=${Boolean(cookieHeader)} csrf=${Boolean(csrfToken)}`,
  );

  // 4. Подготовка регистрации (сервер проверяет контракт)
  const prepared = await api<{
    tx: { to: string; data: string; value: string; chainId: number };
    intentId: string;
    tld: string;
  }>('/api/zones/prepare-registration', {
    method: 'POST',
    body: JSON.stringify({ tld, metadata: '{"e2e":true}', sender: alice.address }),
  });
  record(
    'POST /api/zones/prepare-registration возвращает неподписанную транзакцию',
    prepared.status === 201 && prepared.body.tx.to.toLowerCase() === CONTRACT.toLowerCase(),
    `HTTP ${prepared.status}, intent=${prepared.body.intentId?.slice(0, 8)}…, calldata=${prepared.body.tx?.data?.slice(0, 10)}… (${prepared.body.tx?.data?.length} символов)`,
  );

  // 5. Регистрация зоны подписью кошелька → реальная транзакция
  const registration = await sendAs(alice, prepared.body.tx);
  record(
    'Пользователь регистрирует зону: tx подписана кошельком и попала в блок',
    registration.status === 'success',
    `tx=${registration.hash} block=${registration.blockNumber} gasUsed=${registration.gasUsed}`,
  );

  // 6. Событие TLDRegistered в блоке
  const registeredEvent = findEvent(registration.logs, 'TLDRegistered') as {
    args: { tld?: string; owner?: string; expiresAt?: bigint };
  } | null;
  record(
    'Событие TLDRegistered присутствует в блоке',
    Boolean(registeredEvent && registeredEvent.args.tld === tld),
    registeredEvent
      ? `tld=${registeredEvent.args.tld} owner=${registeredEvent.args.owner} expiresAt=${new Date(Number(registeredEvent.args.expiresAt) * 1000).toISOString()}`
      : 'событие не найдено',
  );

  // 7. Indexer записывает зону в PostgreSQL
  await waitForIndexer(tld, (body) => Boolean((body as { zone?: unknown }).zone));
  const dbRow = await pg.query(
    'SELECT tld, owner_address, status, expires_at, metadata, block_number, transaction_hash FROM zones WHERE tld = $1',
    [tld],
  );
  const eventRow = await pg.query(
    'SELECT event_type, actor_address, block_number FROM zone_events WHERE transaction_hash = $1',
    [registration.hash],
  );
  record(
    'Indexer записал зону и событие в PostgreSQL',
    dbRow.rowCount === 1 && eventRow.rowCount === 1,
    `zones: ${JSON.stringify(dbRow.rows[0])}; zone_events: ${JSON.stringify(eventRow.rows[0])}`,
  );

  // 8. Страница зоны показывает владельца
  const pageResponse = await fetch(`${APP_URL}/zone/${encodeURIComponent(tld)}`);
  const html = await pageResponse.text();
  record(
    'Страница зоны отдаётся и содержит адрес владельца',
    pageResponse.status === 200 && html.includes(tld),
    `HTTP ${pageResponse.status}, html=${html.length} байт, tld в разметке=${html.includes(tld)} (данные подгружаются клиентским запросом из API)`,
  );

  const zoneApi = await api<{
    zone: { ownerAddress: string };
    chain: { owner: string };
    consistent: boolean;
  }>(`/api/zones/${encodeURIComponent(tld)}`);
  record(
    'API зоны сверяет кэш с блокчейном и показывает владельца',
    zoneApi.body.zone.ownerAddress === alice.address.toLowerCase() && zoneApi.body.consistent,
    `cache.owner=${zoneApi.body.zone.ownerAddress} chain.owner=${zoneApi.body.chain.owner} consistent=${zoneApi.body.consistent}`,
  );

  // 9. Передача зоны alice → bob
  const preparedTransfer = await api<{
    tx: { to: string; data: string; value: string };
    intentId: string;
  }>('/api/zones/prepare-transfer', {
    method: 'POST',
    body: JSON.stringify({ tld, to: bob.address, sender: alice.address }),
  });
  const transfer = await sendAs(alice, preparedTransfer.body.tx);
  const transferEvent = findEvent(transfer.logs, 'TLDTransferred') as {
    args: { from?: string; to?: string };
  } | null;
  const ownerAfterTransfer = (await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'ownerOf',
    args: [tld],
  })) as string;
  record(
    'Передача зоны владельцем: ownerOf изменился на новый адрес',
    ownerAfterTransfer.toLowerCase() === bob.address.toLowerCase(),
    `tx=${transfer.hash} block=${transfer.blockNumber} from=${transferEvent?.args.from} to=${transferEvent?.args.to} ownerOf=${ownerAfterTransfer}`,
  );

  await waitForIndexer(
    tld,
    (body) =>
      (body as { zone: { ownerAddress: string } }).zone.ownerAddress === bob.address.toLowerCase(),
  );
  const transferDb = await pg.query(
    `SELECT status, to_address, transaction_hash FROM transfer_requests WHERE zone_id = (SELECT id FROM zones WHERE tld = $1) ORDER BY created_at DESC LIMIT 1`,
    [tld],
  );
  record(
    'Indexer обновил владельца и закрыл transfer_request',
    transferDb.rowCount === 1 && transferDb.rows[0].status === 'completed',
    `transfer_requests: ${JSON.stringify(transferDb.rows[0])}`,
  );

  // 10. Продление зоны (bob — новый владелец)
  const before = (await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getTLD',
    args: [tld],
  })) as unknown as { expiresAt: bigint };
  const preparedRenew = await api<{ tx: { to: string; data: string; value: string } }>(
    '/api/zones/prepare-renewal',
    { method: 'POST', body: JSON.stringify({ tld, sender: bob.address }) },
  );
  const renewal = await sendAs(bob, preparedRenew.body.tx);
  const after = (await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'getTLD',
    args: [tld],
  })) as unknown as { expiresAt: bigint };
  const deltaDays = Number((after.expiresAt - before.expiresAt) / 86400n);
  record(
    'Продление зоны владельцем добавляет 365 дней',
    deltaDays === 365,
    `tx=${renewal.hash} expiresAt: ${new Date(Number(before.expiresAt) * 1000).toISOString()} → ${new Date(Number(after.expiresAt) * 1000).toISOString()} (+${deltaDays} дн.)`,
  );

  // 11. Повторная регистрация отклоняется
  const duplicatePrepare = await api<{ error?: { code?: string; message?: string } }>(
    '/api/zones/prepare-registration',
    { method: 'POST', body: JSON.stringify({ tld, metadata: '', sender: bob.address }) },
  );
  let chainRevert = '';
  try {
    await publicClient.simulateContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'registerTLD',
      args: [tld, ''],
      account: bob.address,
    });
  } catch (error) {
    if (error instanceof BaseError) {
      const revert = error.walk(
        (inner) => inner instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | null;
      chainRevert = revert?.data?.errorName ?? error.shortMessage;
    } else {
      chainRevert = (error as Error).message.split('\n')[0] ?? 'revert';
    }
  }
  record(
    'Повторная регистрация отклоняется (API 409 + revert контракта)',
    duplicatePrepare.status === 409 && chainRevert.includes('TLDAlreadyExists'),
    `API: HTTP ${duplicatePrepare.status} ${duplicatePrepare.body.error?.code}; контракт: ${chainRevert.slice(0, 80)}`,
  );

  // 12. Админ-блокировка и разблокировка (вход по подписи + аудит)
  const adminNonce = await api<{ nonce: string; message: string }>('/api/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ address: admin.address }),
  });
  const adminSignature = await admin.signMessage({ message: adminNonce.body.message });
  const adminVerify = await api<{ user: { role: string } }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({
      address: admin.address,
      signature: adminSignature,
      nonce: adminNonce.body.nonce,
    }),
  });
  const adminCookies = cookieJar(adminVerify.headers);
  const adminCsrf = /justtld_csrf=([^;]+)/.exec(adminCookies)?.[1] ?? '';
  record(
    'Админ входит по подписи и получает роль admin (owner контракта)',
    adminVerify.body.user.role === 'admin',
    `admin=${admin.address} role=${adminVerify.body.user.role}`,
  );

  const blockPrepared = await api<{
    tx: { to: string; data: string; value: string };
    auditId: string;
  }>(`/api/admin/zones/${encodeURIComponent(tld)}/block`, {
    method: 'POST',
    cookies: adminCookies,
    headers: { 'x-csrf-token': adminCsrf },
    body: JSON.stringify({ reason: 'e2e verification' }),
  });
  if (!blockPrepared.body.tx) {
    throw new Error(
      `prepare block не вернул tx: HTTP ${blockPrepared.status} ${JSON.stringify(blockPrepared.body)}`,
    );
  }
  const blockTx = await sendAs(admin, blockPrepared.body.tx);
  const isBlocked = (await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'isBlocked',
    args: [tld],
  })) as boolean;
  record(
    'Админ блокирует зону: on-chain флаг + запись в аудит-логе',
    isBlocked && blockTx.status === 'success',
    `tx=${blockTx.hash} isBlocked=${isBlocked} auditId=${blockPrepared.body.auditId}`,
  );

  // 13. Заблокированную зону нельзя продлить (проверка на уровне API и контракта)
  const blockedRenew = await api<{ error?: { code?: string } }>('/api/zones/prepare-renewal', {
    method: 'POST',
    body: JSON.stringify({ tld, sender: bob.address }),
  });
  record(
    'Заблокированную зону нельзя продлить',
    blockedRenew.status === 409,
    `HTTP ${blockedRenew.status} ${blockedRenew.body.error?.code}`,
  );

  // 14. Разблокировка
  const unblockPrepared = await api<{ tx: { to: string; data: string; value: string } }>(
    `/api/admin/zones/${encodeURIComponent(tld)}/unblock`,
    {
      method: 'POST',
      cookies: adminCookies,
      headers: { 'x-csrf-token': adminCsrf },
      body: JSON.stringify({}),
    },
  );
  const unblockTx = await sendAs(admin, unblockPrepared.body.tx);
  const isBlockedAfter = (await publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName: 'isBlocked',
    args: [tld],
  })) as boolean;
  record(
    'Админ разблокирует зону',
    !isBlockedAfter && unblockTx.status === 'success',
    `tx=${unblockTx.hash} isBlocked=${isBlockedAfter}`,
  );

  const auditRow = await pg.query(
    'SELECT actor_address, action, target, outcome FROM admin_audit_log ORDER BY created_at DESC LIMIT 3',
  );
  record(
    'Аудит-лог администратора содержит выполненные действия',
    (auditRow.rowCount ?? 0) > 0,
    JSON.stringify(auditRow.rows),
  );

  // 15. Итоговое состояние в БД
  const finalZone = await pg.query(
    'SELECT tld, owner_address, status, metadata, block_number FROM zones WHERE tld = $1',
    [tld],
  );
  const stats = await api<{ total: number; totalEvents: number }>('/api/stats');
  record(
    'Итоговое состояние: зона, владелец, статус и статистика',
    finalZone.rowCount === 1 && stats.body.total >= 1,
    `zone=${JSON.stringify(finalZone.rows[0])}; stats={total:${stats.body.total}, events:${stats.body.totalEvents}}`,
  );

  const balance = await publicClient.getBalance({ address: bob.address });

  heading('Итог');
  for (const [index, item] of results.entries()) {
    console.log(`${String(index + 1).padStart(2)}. ${item.ok ? 'OK  ' : 'FAIL'} ${item.name}`);
  }
  console.log(`\nВсе проверки пройдены: ${results.length}/${results.length}`);
  console.log(`Баланс bob после операций: ${formatEther(balance)} ETH`);
  console.log(`Тестовая зона: ${tld} (владелец ${bob.address})`);

  await pg.end();
}

main().catch(async (error) => {
  console.error('\n❌ Проверка остановлена:', error.message);
  process.exit(1);
});
