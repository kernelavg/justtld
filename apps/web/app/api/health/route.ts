import fs from 'node:fs';
import { APP_VERSION, type HealthDto } from '@justtld/shared';
import { getCheckpoint, pingDatabase } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';
import { getChainHead, getContractCodeInfo, pingChain } from '@/lib/server/chain';
import { adminAddress, chainId, deployment } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

/** Состояние keep-alive (файл-сердцебиение пишет scripts/keep-alive.mjs). */
function readKeepAlive(): Record<string, unknown> | null {
  const file = process.env.KEEP_ALIVE_HEARTBEAT_FILE ?? '/tmp/justtld-keep-alive.json';
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const lastPingAt = typeof raw.lastPingAt === 'string' ? raw.lastPingAt : null;
    return {
      ...raw,
      ageSeconds: lastPingAt ? Math.round((Date.now() - Date.parse(lastPingAt)) / 1000) : null,
    };
  } catch {
    return null;
  }
}

export const GET = route(
  async () => {
    const db = await pingDatabase();
    const chain = await pingChain();
    const contract = await getContractCodeInfo();
    const checkpoint = db.ok ? await getCheckpoint().catch(() => null) : null;
    const head = chain.ok ? await getChainHead().catch(() => 0) : 0;
    const lastIndexedBlock = checkpoint?.lastBlock ?? 0;
    const lag = Math.max(0, head - lastIndexedBlock);

    const body: HealthDto = {
      status: 'ok',
      checks: {
        database: { ok: db.ok, latencyMs: db.latencyMs, ...(db.error ? { error: db.error } : {}) },
        rpc: {
          ok: chain.ok,
          latencyMs: chain.latencyMs,
          ...(chain.chainId !== undefined ? { chainId: chain.chainId } : {}),
          ...(chain.blockNumber !== undefined ? { blockNumber: chain.blockNumber } : {}),
          ...(chain.error ? { error: chain.error } : {}),
        },
        contract: {
          ok: contract.ok,
          address: contract.address,
          codeSize: contract.codeSize,
          ...(contract.error ? { error: contract.error } : {}),
        },
        indexer: {
          ok: checkpoint !== null && lag < 50,
          lastIndexedBlock,
          lag,
          ...(checkpoint === null
            ? { error: 'чекпоинт индексатора не найден (indexer не запускался)' }
            : {}),
        },
      },
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };

    if (!db.ok || !chain.ok || !contract.ok) body.status = 'error';
    else if (!body.checks.indexer.ok) body.status = 'degraded';

    const status = body.status === 'error' ? 503 : 200;
    return jsonResponse(
      {
        ...body,
        config: {
          chainId: chainId(),
          adminAddress: adminAddress(),
          contract: deployment()?.address ?? null,
          abiHash: deployment()?.abiHash ?? null,
        },
        keepAlive: readKeepAlive(),
      },
      { status },
    );
  },
  { limit: 'read', bucket: 'health' },
);
