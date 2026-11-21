import { decodeEventLog, type Abi } from 'viem';
import {
  CONTRACT_EVENT_TO_TYPE,
  SUBDOMAIN_EVENT_TO_TYPE,
  type ContractEventName,
  type SubdomainContractEventName,
  type SubdomainEventType,
  type ZoneEventType,
} from '@justtld/shared';
import { SUBDOMAINS_ABI } from '@justtld/shared/generated/subdomains';
import * as db from '@justtld/db';
import {
  getBlock,
  getContractLogs,
  readSubdomain,
  readZone,
  zoneStatusFromChain,
  type ChainClient,
  type RawLog,
} from './chain';

export type ProcessorContext = {
  client: ChainClient;
  address: `0x${string}`;
  chainId: number;
  abi: readonly unknown[];
  /** Писать ли чекпоинт в БД (в тестах можно отключить, чтобы не мешать основному индексатору). */
  persistCheckpoint: boolean;
  log: (message: string) => void;
  /** Контракт поддоменов: если задан, индексируются и его события. */
  subdomains?: { address: `0x${string}`; abi: readonly unknown[] } | null;
};

export type DecodedZoneEvent = {
  eventName: ContractEventName;
  eventType: ZoneEventType;
  tld: string;
  actor: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  details: Record<string, unknown>;
};

const ZONE_EVENTS = new Set<string>(Object.keys(CONTRACT_EVENT_TO_TYPE));

/**
 * Декодирует лог контракта в событие зоны.
 * Возвращает null для служебных событий (резервы, blacklist) и неизвестных логов.
 */
export function decodeZoneLog(log: RawLog): DecodedZoneEvent | null {
  if (
    !log.topics?.[0] ||
    !log.transactionHash ||
    log.blockNumber === null ||
    log.logIndex === null
  ) {
    return null;
  }
  let decoded: { eventName?: string; args?: unknown };
  try {
    decoded = decodeEventLog({
      abi: registryAbi,
      data: log.data,
      topics: log.topics,
    }) as unknown as { eventName?: string; args?: unknown };
  } catch {
    return null;
  }
  const eventName = decoded.eventName;
  if (!eventName || !ZONE_EVENTS.has(eventName)) return null;

  const args = (decoded.args ?? {}) as Record<string, unknown>;
  const tld = typeof args.tld === 'string' ? args.tld : null;
  if (!tld) return null;

  const asAddress = (value: unknown): string =>
    typeof value === 'string' ? value.toLowerCase() : '';
  const asNumber = (value: unknown): number =>
    typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

  const eventType = CONTRACT_EVENT_TO_TYPE[eventName as ContractEventName];
  let actor = '';
  let details: Record<string, unknown> = {};

  switch (eventName) {
    case 'TLDRegistered':
      actor = asAddress(args.owner);
      details = { expiresAt: asNumber(args.expiresAt), metadata: asString(args.metadata) };
      break;
    case 'TLDTransferred':
      actor = asAddress(args.from);
      details = { from: asAddress(args.from), to: asAddress(args.to) };
      break;
    case 'TLDRenewed':
      actor = asAddress(args.owner);
      details = { newExpiresAt: asNumber(args.newExpiresAt) };
      break;
    case 'TLDMetadataUpdated':
      actor = asAddress(args.owner);
      details = { metadata: asString(args.metadata) };
      break;
    case 'TLDBlocked':
      actor = asAddress(args.by);
      details = { reason: asString(args.reason) };
      break;
    case 'TLDUnblocked':
      actor = asAddress(args.by);
      details = {};
      break;
    default:
      return null;
  }

  return {
    eventName: eventName as ContractEventName,
    eventType,
    tld: tld.toLowerCase(),
    actor,
    transactionHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash ?? '',
    logIndex: log.logIndex,
    details: { ...details, timestamp: asNumber(args.timestamp) },
  };
}

export type DecodedSubdomainEvent = {
  eventName: SubdomainContractEventName;
  eventType: SubdomainEventType;
  /** Полное имя: `blog.femboy`. */
  name: string;
  /** Родительская зона: `.femboy`. */
  tld: string;
  /** Метка: `blog`. */
  label: string;
  actor: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  details: Record<string, unknown>;
};

const SUBDOMAIN_EVENTS = new Set<string>(Object.keys(SUBDOMAIN_EVENT_TO_TYPE));

/** Разбирает `blog.femboy` на метку и зону (зона всегда с ведущей точкой). */
export function splitSubdomainName(name: string): { label: string; tld: string } | null {
  const index = name.indexOf('.');
  if (index <= 0 || index === name.length - 1) return null;
  return { label: name.slice(0, index), tld: name.slice(index) };
}

/** Декодирует лог контракта поддоменов. null — служебный или неизвестный лог. */
export function decodeSubdomainLog(log: RawLog): DecodedSubdomainEvent | null {
  if (
    !log.topics?.[0] ||
    !log.transactionHash ||
    log.blockNumber === null ||
    log.logIndex === null
  ) {
    return null;
  }
  let decoded: { eventName?: string; args?: unknown };
  try {
    decoded = decodeEventLog({
      abi: SUBDOMAINS_ABI as unknown as Abi,
      data: log.data,
      topics: log.topics,
    }) as unknown as { eventName?: string; args?: unknown };
  } catch {
    return null;
  }
  const eventName = decoded.eventName;
  if (!eventName || !SUBDOMAIN_EVENTS.has(eventName)) return null;

  const args = (decoded.args ?? {}) as Record<string, unknown>;
  const name = typeof args.name === 'string' ? args.name.toLowerCase() : null;
  if (!name) return null;
  const parts = splitSubdomainName(name);
  if (!parts) return null;

  const asAddress = (value: unknown): string =>
    typeof value === 'string' ? value.toLowerCase() : '';
  const asNumber = (value: unknown): number =>
    typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

  const eventType = SUBDOMAIN_EVENT_TO_TYPE[eventName as SubdomainContractEventName];
  let actor = '';
  let details: Record<string, unknown> = {};

  switch (eventName) {
    case 'SubdomainRegistered':
      actor = asAddress(args.owner);
      details = { tld: asString(args.zone), expiresAt: asNumber(args.expiresAt) };
      break;
    case 'SubdomainTransferred':
      actor = asAddress(args.from);
      details = { from: asAddress(args.from), to: asAddress(args.to) };
      break;
    case 'SubdomainRenewed':
      actor = '';
      details = { newExpiresAt: asNumber(args.expiresAt) };
      break;
    case 'SubdomainMetadataUpdated':
      actor = asAddress(args.owner);
      details = { metadata: asString(args.metadata) };
      break;
    case 'SubdomainBlocked':
      actor = asAddress(args.admin);
      details = { reason: asString(args.reason) };
      break;
    case 'SubdomainUnblocked':
      actor = asAddress(args.admin);
      details = {};
      break;
    default:
      return null;
  }

  return {
    eventName: eventName as SubdomainContractEventName,
    eventType,
    name,
    tld: parts.tld,
    label: parts.label,
    actor,
    transactionHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash ?? '',
    logIndex: log.logIndex,
    details: { ...details, timestamp: asNumber(args.timestamp) },
  };
}

let registryAbi: Abi = [] as unknown as Abi;
export function setRegistryAbi(abi: readonly unknown[]): void {
  registryAbi = abi as unknown as Abi;
}

export type ProcessResult = {
  processed: number;
  skipped: number;
  lastBlock: number;
};

/**
 * Применяет события из диапазона блоков к базе.
 * Каждый блок обрабатывается в отдельной транзакции вместе с чекпоинтом:
 * либо данные и позиция сохраняются вместе, либо ничего (нет «дыр» и потерь).
 */
export async function processRange(
  ctx: ProcessorContext,
  fromBlock: number,
  toBlock: number,
): Promise<ProcessResult> {
  if (toBlock < fromBlock) return { processed: 0, skipped: 0, lastBlock: fromBlock - 1 };

  const logs = await getContractLogs(ctx.client, {
    address: ctx.address,
    fromBlock,
    toBlock,
  });

  // Поддомены живут в отдельном контракте — забираем и его логи за тот же диапазон.
  const subdomainsAddress = ctx.subdomains?.address?.toLowerCase();
  if (ctx.subdomains) {
    const subLogs = await getContractLogs(ctx.client, {
      address: ctx.subdomains.address,
      fromBlock,
      toBlock,
    });
    logs.push(...subLogs);
  }

  const grouped = new Map<number, RawLog[]>();
  for (const log of logs) {
    if (log.blockNumber === null) continue;
    const blockNumber = Number(log.blockNumber);
    const bucket = grouped.get(blockNumber);
    if (bucket) bucket.push(log);
    else grouped.set(blockNumber, [log]);
  }

  const blockNumbers = [...grouped.keys()].sort((a, b) => a - b);
  let processed = 0;
  let skipped = 0;
  let lastBlock = fromBlock - 1;

  for (const blockNumber of blockNumbers) {
    const block = await getBlock(ctx.client, blockNumber);
    const blockLogs = grouped.get(blockNumber) ?? [];

    await db.withTransaction(async (client) => {
      for (const rawLog of blockLogs) {
        if (subdomainsAddress && rawLog.address?.toLowerCase() === subdomainsAddress) {
          const subEvent = decodeSubdomainLog(rawLog);
          if (!subEvent) {
            skipped += 1;
            continue;
          }
          const freshSub = await db.markLogProcessed(client, {
            transactionHash: subEvent.transactionHash,
            logIndex: subEvent.logIndex,
            blockNumber: subEvent.blockNumber,
            blockHash: block.hash ?? '',
            eventName: subEvent.eventName,
          });
          if (!freshSub) {
            skipped += 1;
            continue;
          }

          const chainSub = await readSubdomain(
            ctx.client,
            ctx.subdomains?.address ?? ctx.address,
            subEvent.tld,
            subEvent.label,
          );
          if (!chainSub) {
            ctx.log(`! поддомен ${subEvent.name} отсутствует в контракте — пропущено`);
            skipped += 1;
            continue;
          }

          const nowSeconds = Math.floor(Date.now() / 1000);
          const subStatus = chainSub.blocked
            ? 'blocked'
            : chainSub.expiresAt <= nowSeconds
              ? 'expired'
              : 'active';

          const subdomain = await db.upsertSubdomainSnapshot(client, {
            name: subEvent.name,
            tld: subEvent.tld,
            label: subEvent.label,
            ownerAddress: chainSub.owner,
            zoneOwnerAddress: chainSub.zoneOwner,
            status: subStatus,
            registeredAt: new Date(chainSub.registeredAt * 1000),
            expiresAt: new Date(chainSub.expiresAt * 1000),
            metadata: chainSub.metadata,
            transactionHash: subEvent.transactionHash,
            blockNumber: subEvent.blockNumber,
          });

          const insertedSub = await db.insertSubdomainEvent(client, {
            subdomainId: subdomain.id,
            name: subEvent.name,
            eventType: subEvent.eventType,
            actorAddress: subEvent.actor,
            transactionHash: subEvent.transactionHash,
            blockNumber: subEvent.blockNumber,
            logIndex: subEvent.logIndex,
            details: subEvent.details,
          });
          if (insertedSub) processed += 1;
          if (subEvent.actor) await db.ensureUser(client, subEvent.actor);
          continue;
        }

        const event = decodeZoneLog(rawLog);
        if (!event) {
          skipped += 1;
          continue;
        }
        if (event.blockHash && block.hash && event.blockHash !== block.hash) {
          throw new Error(
            `Несовпадение blockHash для блока ${blockNumber}: лог=${event.blockHash} блок=${block.hash}`,
          );
        }

        const fresh = await db.markLogProcessed(client, {
          transactionHash: event.transactionHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          blockHash: block.hash ?? '',
          eventName: event.eventName,
        });
        if (!fresh) {
          skipped += 1;
          continue;
        }

        const chainZone = await readZone(ctx.client, ctx.address, event.tld);
        if (!chainZone) {
          ctx.log(
            `! зона ${event.tld} отсутствует в контракте (событие ${event.eventName}) — пропущено`,
          );
          skipped += 1;
          continue;
        }

        const zone = await db.upsertZoneSnapshot(client, {
          tld: event.tld,
          ownerAddress: chainZone.owner,
          status: zoneStatusFromChain(chainZone),
          registeredAt: new Date(chainZone.registeredAt * 1000),
          expiresAt: new Date(chainZone.expiresAt * 1000),
          metadata: chainZone.metadata,
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
        });

        const inserted = await db.insertZoneEvent(client, {
          zoneId: zone.id,
          eventType: event.eventType,
          actorAddress: event.actor,
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          details: event.details,
        });
        if (inserted) processed += 1;

        if (event.actor) await db.ensureUser(client, event.actor);

        if (event.eventType === 'transferred') {
          const to = String(event.details.to ?? '');
          if (to) await db.completePendingTransfers(client, zone.id, to, event.transactionHash);
        }
        if (event.eventType === 'registered') {
          await db.cancelPendingTransfers(client, zone.id);
        }
      }

      if (ctx.persistCheckpoint) {
        await db.saveCheckpoint(client, {
          lastBlock: blockNumber,
          lastBlockHash: block.hash ?? '',
          chainId: ctx.chainId,
          contractAddress: ctx.address,
        });
      }
    });

    lastBlock = blockNumber;
  }

  if (lastBlock < toBlock && ctx.persistCheckpoint) {
    const block = await getBlock(ctx.client, toBlock);
    await db.withTransaction(async (client) => {
      await db.saveCheckpoint(client, {
        lastBlock: toBlock,
        lastBlockHash: block.hash ?? '',
        chainId: ctx.chainId,
        contractAddress: ctx.address,
      });
    });
    lastBlock = toBlock;
  }

  return { processed, skipped, lastBlock };
}

/** Полная переиндексация: очищает кэш и проходит историю с нуля. */
export async function resyncAll(
  ctx: ProcessorContext,
  startBlock: number,
  purge = true,
): Promise<{ processed: number; lastBlock: number }> {
  if (purge) {
    await db.withTransaction(async (client) => {
      await db.purgeIndexedData(client);
    });
    ctx.log('кэш очищен (zones, zone_events, transfer_requests, processed_logs)');
  }
  const head = Number(await ctx.client.getBlockNumber());
  const result = await processRange(ctx, Math.max(0, startBlock), head);
  ctx.log(`resync завершён: блоки ${startBlock}..${head}, событий ${result.processed}`);
  return { processed: result.processed, lastBlock: result.lastBlock };
}

export type SyncTickResult = {
  head: number;
  fromBlock: number;
  toBlock: number;
  processed: number;
  skipped: number;
  lastIndexedBlock: number;
  lag: number;
  reorg: boolean;
};

/**
 * Один цикл синхронизации: проверяет реорганизацию, добирает блоки до head - confirmations.
 */
export async function syncTick(
  ctx: ProcessorContext,
  config: { startBlock: number; confirmations: number; batchSize: number },
): Promise<SyncTickResult> {
  const head = Number(await ctx.client.getBlockNumber());
  const safeHead = Math.max(0, head - Math.max(1, config.confirmations) + 1);
  const checkpoint = await db.getCheckpoint();
  let reorg = false;

  let fromBlock: number;
  if (!checkpoint) {
    fromBlock = Math.max(0, config.startBlock);
  } else if (
    checkpoint.chainId !== ctx.chainId ||
    checkpoint.contractAddress.toLowerCase() !== ctx.address.toLowerCase()
  ) {
    ctx.log('чекпоинт относится к другому контракту/сети → полная переиндексация');
    await resyncAll(ctx, config.startBlock, true);
    return {
      head,
      fromBlock: config.startBlock,
      toBlock: head,
      processed: 0,
      skipped: 0,
      lastIndexedBlock: head,
      lag: 0,
      reorg: true,
    };
  } else {
    fromBlock = checkpoint.lastBlock + 1;
    if (checkpoint.lastBlock > 0 && checkpoint.lastBlockHash) {
      try {
        const storedBlock = await getBlock(ctx.client, checkpoint.lastBlock);
        if (storedBlock.hash && storedBlock.hash !== checkpoint.lastBlockHash) {
          reorg = true;
          ctx.log('обнаружена реорганизация цепочки → переиндексация с нуля');
          await resyncAll(ctx, config.startBlock, true);
          return {
            head,
            fromBlock: config.startBlock,
            toBlock: head,
            processed: 0,
            skipped: 0,
            lastIndexedBlock: head,
            lag: 0,
            reorg: true,
          };
        }
      } catch {
        ctx.log('не удалось прочитать блок чекпоинта (узел перезапущен?) → переиндексация');
        await resyncAll(ctx, config.startBlock, true);
        return {
          head,
          fromBlock: config.startBlock,
          toBlock: head,
          processed: 0,
          skipped: 0,
          lastIndexedBlock: head,
          lag: 0,
          reorg: true,
        };
      }
    }
  }

  let processed = 0;
  let skipped = 0;
  let cursor = fromBlock;
  while (cursor <= safeHead) {
    const toBlock = Math.min(safeHead, cursor + config.batchSize - 1);
    const result = await processRange(ctx, cursor, toBlock);
    processed += result.processed;
    skipped += result.skipped;
    cursor = toBlock + 1;
  }

  const updated = await db.getCheckpoint();
  const lastIndexedBlock = updated?.lastBlock ?? 0;
  return {
    head,
    fromBlock,
    toBlock: safeHead,
    processed,
    skipped,
    lastIndexedBlock,
    lag: Math.max(0, head - lastIndexedBlock),
    reorg,
  };
}
