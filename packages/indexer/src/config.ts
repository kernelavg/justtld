import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { loadRootEnv } from '@justtld/shared/env';
import { findDeploymentFile, readDeployment } from '@justtld/shared/deployment';
import type { Deployment } from '@justtld/shared/deployment';

export { findDeploymentFile, readDeployment };
export type { Deployment };

export type IndexerConfig = {
  rpcUrl: string;
  chainId: number;
  address: `0x${string}`;
  deployBlock: number;
  startBlock: number;
  confirmations: number;
  pollIntervalMs: number;
  batchSize: number;
  persistCheckpoint: boolean;
  abi: typeof REGISTRY_ABI;
};

export function loadConfig(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  loadRootEnv();
  const deployment = readDeployment();
  const deployBlock = Number(deployment.deployBlock ?? 0);
  const envStartBlock = process.env.INDEXER_START_BLOCK?.trim()
    ? Number.parseInt(process.env.INDEXER_START_BLOCK, 10)
    : Number.NaN;

  // Никогда не сканируем блоки раньше деплоя контракта: в публичных сетях такие
  // диапазоны (или уже «подрезанная» история) приводят к ошибкам RPC.
  const requestedStart = Number.isFinite(envStartBlock) ? envStartBlock : deployBlock;

  return {
    rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
    chainId: Number(process.env.CHAIN_ID ?? deployment.chainId ?? 31337),
    address: deployment.address,
    deployBlock,
    startBlock: Math.max(requestedStart, deployBlock),
    confirmations: Number.parseInt(process.env.INDEXER_CONFIRMATIONS ?? '1', 10),
    pollIntervalMs: Number.parseInt(process.env.INDEXER_POLL_INTERVAL_MS ?? '1000', 10),
    batchSize: Number.parseInt(process.env.INDEXER_BATCH_SIZE ?? '2000', 10),
    persistCheckpoint: true,
    abi: REGISTRY_ABI,
    ...overrides,
  };
}
