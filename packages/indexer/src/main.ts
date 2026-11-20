import * as db from '@justtld/db';
import { loadConfig, type IndexerConfig } from './config';
import { createChainClient, isContractDeployed } from './chain';
import {
  processRange,
  resyncAll,
  setRegistryAbi,
  syncTick,
  type ProcessorContext,
} from './processor';

type CliOptions = {
  once: boolean;
  resync: boolean;
  purge: boolean;
  dryRun: boolean;
  fromBlock: number | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    once: false,
    resync: false,
    purge: true,
    dryRun: false,
    fromBlock: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') options.once = true;
    else if (arg === '--resync') options.resync = true;
    else if (arg === '--keep') options.purge = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--from') {
      const value = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(value)) {
        options.fromBlock = value;
        i += 1;
      }
    }
  }
  return options;
}

function log(message: string): void {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[indexer ${time}] ${message}`);
}

function buildContext(config: IndexerConfig, persistCheckpoint = true): ProcessorContext {
  const client = createChainClient(config.rpcUrl);
  setRegistryAbi(config.abi);
  return {
    client,
    address: config.address,
    chainId: config.chainId,
    abi: config.abi,
    persistCheckpoint,
    log,
  };
}

async function bootstrap(): Promise<{ config: IndexerConfig; ctx: ProcessorContext }> {
  const config = loadConfig();
  await db.runMigrations(false);

  const ctx = buildContext(config);
  const deployment = await isContractDeployed(ctx.client, config.address);
  if (!deployment.ok) {
    throw new Error(
      `По адресу ${config.address} нет кода. Запустите локальную сеть (npm run chain) и деплой (npm run deploy).`,
    );
  }

  log(`сеть ${config.rpcUrl} (chainId ${config.chainId})`);
  log(
    `контракт ${config.address}, стартовый блок ${config.startBlock}, подтверждений ${config.confirmations}`,
  );
  return { config, ctx };
}

async function runDryRun(config: IndexerConfig): Promise<void> {
  const ctx = buildContext(config, false);
  const head = Number(await ctx.client.getBlockNumber());
  const result = await processRange({ ...ctx, persistCheckpoint: false }, config.startBlock, head);
  log(
    `dry-run: блоки ${config.startBlock}..${head}, событий ${result.processed}, пропущено ${result.skipped}`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { config, ctx } = await bootstrap();

  if (options.dryRun) {
    await runDryRun(config);
    await db.closePool();
    return;
  }

  if (options.resync) {
    await resyncAll(ctx, options.fromBlock ?? config.startBlock, options.purge);
    await db.closePool();
    return;
  }

  if (options.once) {
    const result = await syncTick(ctx, config);
    await db.refreshExpiredStatuses();
    log(
      `один проход: блоки ${result.fromBlock}..${result.toBlock}, обработано ${result.processed}, ` +
        `пропущено ${result.skipped}, чекпоинт ${result.lastIndexedBlock}, лаг ${result.lag}`,
    );
    await db.closePool();
    return;
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`получен ${signal}: завершаю текущий цикл…`);
    await db.closePool().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  let lastStatusLog = 0;
  let lastStatusRefresh = 0;
  log('индексатор запущен');

  while (!stopping) {
    const startedAt = Date.now();
    try {
      const result = await syncTick(ctx, config);
      const now = Date.now();
      if (result.processed > 0 || result.reorg) {
        log(
          `блоки ${result.fromBlock}..${result.toBlock} → событий ${result.processed}, ` +
            `пропущено ${result.skipped}, чекпоинт ${result.lastIndexedBlock}, лаг ${result.lag}`,
        );
      } else if (now - lastStatusLog > 30_000) {
        log(
          `ожидание: head ${result.head}, чекпоинт ${result.lastIndexedBlock}, лаг ${result.lag}`,
        );
        lastStatusLog = now;
      }
      const commands = await db.takePendingIndexerCommands(3).catch(() => []);
      for (const command of commands) {
        if (command.command === 'resync') {
          const fromBlock = Number(command.payload.fromBlock ?? config.startBlock);
          const purge = command.payload.purge !== false;
          log(`команда resync (from=${fromBlock}, purge=${purge})`);
          await resyncAll(ctx, Number.isFinite(fromBlock) ? fromBlock : config.startBlock, purge);
          await db.completeIndexerCommand(command.id, `resync ok from ${fromBlock}`);
        } else {
          await db.completeIndexerCommand(command.id, `неизвестная команда: ${command.command}`);
        }
      }

      if (now - lastStatusRefresh > 15_000) {
        const updated = await db.refreshExpiredStatuses();
        if (updated > 0) log(`пересчитаны статусы истёкших зон: ${updated}`);
        lastStatusRefresh = now;
        await db.cleanupExpiredIntents();
      }
    } catch (error) {
      log(
        `ошибка синхронизации: ${(error as Error).message} — повтор через ${config.pollIntervalMs}мс`,
      );
    }

    const elapsed = Date.now() - startedAt;
    const delay = Math.max(50, config.pollIntervalMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

main().catch(async (error) => {
  console.error('[indexer] фатальная ошибка:', error);
  await db.closePool().catch(() => undefined);
  process.exit(1);
});
