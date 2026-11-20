// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { readDeployment } from '@justtld/shared/deployment';
import * as db from '@justtld/db';
import { processRange, resyncAll, setRegistryAbi, type ProcessorContext } from '../src/processor';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const keys = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  alice: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  bob: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const;
const admin = privateKeyToAccount(keys.admin);
const alice = privateKeyToAccount(keys.alice);
const bob = privateKeyToAccount(keys.bob);

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
  transport: http(RPC_URL, { timeout: 5000, retryCount: 0 }),
});

const ready = await (async () => {
  if (!deployment || !chain) return false;
  try {
    await publicClient.getBlockNumber();
    await db.queryRows('SELECT 1');
    return true;
  } catch {
    return false;
  }
})();

function wallet(account: typeof alice) {
  return createWalletClient({ account, chain: chain!, transport: http(RPC_URL) });
}

let ctx: ProcessorContext;
const tld = `.vit-${Math.random().toString(36).slice(2, 7)}`;

async function sendRegister(metadata = '{"vitest":true}') {
  const hash = await wallet(alice).writeContract({
    address: deployment!.address,
    abi: REGISTRY_ABI,
    functionName: 'registerTLD',
    args: [tld, metadata],
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

describe.skipIf(!ready)('Indexer: реальная EVM-сеть + PostgreSQL', () => {
  beforeAll(() => {
    setRegistryAbi(REGISTRY_ABI);
    ctx = {
      client: publicClient as never,
      address: deployment!.address as `0x${string}`,
      chainId: deployment!.chainId,
      abi: REGISTRY_ABI,
      persistCheckpoint: false,
      log: () => undefined,
    };
  });

  afterAll(async () => {
    await db.queryRows('DELETE FROM zones WHERE tld = $1', [tld]).catch(() => undefined);
    await db.closePool();
  });

  it('индексирует TLDRegistered и записывает зону в БД', async () => {
    const receipt = await sendRegister();
    const blockNumber = Number(receipt.blockNumber);
    const result = await processRange(ctx, blockNumber, blockNumber);

    expect(result.processed).toBe(1);
    const zone = await db.getZoneByTld(tld);
    expect(zone).not.toBeNull();
    expect(zone!.ownerAddress).toBe(alice.address.toLowerCase());
    expect(zone!.status).toBe('active');
    expect(zone!.metadata).toBe('{"vitest":true}');
    expect(zone!.blockNumber).toBe(blockNumber);
    expect(zone!.transactionHash).toBe(receipt.transactionHash);

    const history = await db.listZoneEvents(zone!.id, { page: 1, limit: 10 });
    expect(history.total).toBe(1);
    expect(history.items[0]?.eventType).toBe('registered');
    expect(history.items[0]?.actorAddress).toBe(alice.address.toLowerCase());
  });

  it('идемпотентен: повторная обработка того же блока не создаёт дублей', async () => {
    const zoneBefore = await db.getZoneByTld(tld);
    const blockNumber = zoneBefore!.blockNumber;
    const result = await processRange(ctx, blockNumber, blockNumber);
    expect(result.processed).toBe(0);
    const zone = await db.getZoneByTld(tld);
    const history = await db.listZoneEvents(zone!.id, { page: 1, limit: 10 });
    expect(history.total).toBe(1);
  });

  it('обрабатывает TLDTransferred и обновляет владельца', async () => {
    const hash = await wallet(alice).writeContract({
      address: deployment!.address,
      abi: REGISTRY_ABI,
      functionName: 'transferTLD',
      args: [tld, bob.address],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const blockNumber = Number(receipt.blockNumber);
    await processRange(ctx, blockNumber, blockNumber);

    const zone = await db.getZoneByTld(tld);
    expect(zone!.ownerAddress).toBe(bob.address.toLowerCase());
    const history = await db.listZoneEvents(zone!.id, { page: 1, limit: 10 });
    const transferred = history.items.find((item) => item.eventType === 'transferred');
    expect(transferred).toBeDefined();
    expect(transferred!.details.to).toBe(bob.address.toLowerCase());
    expect(transferred!.details.from).toBe(alice.address.toLowerCase());
  });

  it('обрабатывает TLDRenewed и обновляет expires_at', async () => {
    const before = await db.getZoneByTld(tld);
    const hash = await wallet(bob).writeContract({
      address: deployment!.address,
      abi: REGISTRY_ABI,
      functionName: 'renewTLD',
      args: [tld],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await processRange(ctx, Number(receipt.blockNumber), Number(receipt.blockNumber));
    const after = await db.getZoneByTld(tld);
    const deltaDays =
      (new Date(after!.expiresAt).getTime() - new Date(before!.expiresAt).getTime()) / 86_400_000;
    expect(Math.round(deltaDays)).toBe(365);
  });

  it('обрабатывает TLDBlocked и переводит зону в статус blocked', async () => {
    const hash = await wallet(admin).writeContract({
      address: deployment!.address,
      abi: REGISTRY_ABI,
      functionName: 'blockTLD',
      args: [tld, 'indexer test'],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await processRange(ctx, Number(receipt.blockNumber), Number(receipt.blockNumber));
    const zone = await db.getZoneByTld(tld);
    expect(zone!.status).toBe('blocked');

    const unblockHash = await wallet(admin).writeContract({
      address: deployment!.address,
      abi: REGISTRY_ABI,
      functionName: 'unblockTLD',
      args: [tld],
    });
    const unblockReceipt = await publicClient.waitForTransactionReceipt({ hash: unblockHash });
    await processRange(ctx, Number(unblockReceipt.blockNumber), Number(unblockReceipt.blockNumber));
    const after = await db.getZoneByTld(tld);
    expect(after!.status).toBe('active');
  });

  it('история зоны содержит все типы событий по порядку', async () => {
    const zone = await db.getZoneByTld(tld);
    const history = await db.listZoneEvents(zone!.id, { page: 1, limit: 50 });
    const types = history.items.map((item) => item.eventType);
    expect(types).toContain('registered');
    expect(types).toContain('transferred');
    expect(types).toContain('renewed');
    expect(types).toContain('blocked');
    expect(types).toContain('unblocked');
    expect(history.total).toBe(5);
  });

  it('resync без очистки перечитывает историю и не ломает данные', async () => {
    const before = await db.getZoneByTld(tld);
    const result = await resyncAll(ctx, 0, false);
    const after = await db.getZoneByTld(tld);
    expect(after!.id).toBe(before!.id);
    expect(after!.ownerAddress).toBe(before!.ownerAddress);
    expect(result.lastBlock).toBeGreaterThan(0);
  });

  it('purge + resync с нуля полностью восстанавливает кэш (ALLOW_DESTRUCTIVE_TESTS=true)', async () => {
    if (process.env.ALLOW_DESTRUCTIVE_TESTS !== 'true') {
      // Тест очищает кэш всей системы — запускается только явно, чтобы не мешать dev-данным.
      expect(true).toBe(true);
      return;
    }
    const before = await db.getZoneByTld(tld);
    await resyncAll(ctx, 0, true);
    const after = await db.getZoneByTld(tld);
    expect(after).not.toBeNull();
    expect(after!.ownerAddress).toBe(before!.ownerAddress);
    const history = await db.listZoneEvents(after!.id, { page: 1, limit: 50 });
    expect(history.total).toBe(5);
  }, 120_000);
});
