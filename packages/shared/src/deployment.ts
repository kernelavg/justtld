import fs from 'node:fs';
import path from 'node:path';

export type Deployment = {
  contract: string;
  address: `0x${string}`;
  chainId: number;
  deployBlock: number;
  deployedAt?: string;
  deployer: string;
  owner: string;
  allowReclaim: boolean;
  reserved?: string[];
  blacklist?: string[];
  abiHash?: string;
};

/** Поднимается от cwd вверх в поисках каталога deployments/ (монорепо). */
export function findDeploymentsDir(startDir = process.cwd(), maxDepth = 6): string | null {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const candidate = path.join(dir, 'deployments');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readJson(file: string): Deployment | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Deployment;
    if (!raw.address || !/^0x[0-9a-fA-F]{40}$/.test(raw.address)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Выбор файла деплоя. Приоритет:
 *   1. DEPLOYMENT_FILE — явный путь (абсолютный или от корня репозитория);
 *   2. DEPLOYMENT_NETWORK — deployments/<network>.json (localhost, sepolia, mainnet…);
 *   3. CHAIN_ID — файл, в котором chainId совпадает (удобно при переключении сетей);
 *   4. deployments/localhost.json → deployments/hardhat.json → первый попавшийся.
 *
 * Так один и тот же код работает и с локальной сетью, и с публичным тестнетом.
 */
export function findDeploymentFile(startDir = process.cwd(), maxDepth = 6): string | null {
  const explicit = process.env.DEPLOYMENT_FILE?.trim();
  if (explicit) {
    const absolute = path.isAbsolute(explicit) ? explicit : path.resolve(startDir, explicit);
    if (fs.existsSync(absolute)) return absolute;
  }

  const dir = findDeploymentsDir(startDir, maxDepth);
  if (!dir) return null;

  const wantedNetwork = process.env.DEPLOYMENT_NETWORK?.trim();
  if (wantedNetwork) {
    const candidate = path.join(dir, `${wantedNetwork}.json`);
    if (fs.existsSync(candidate)) return candidate;
  }

  const wantedChain = Number(process.env.CHAIN_ID);
  if (Number.isFinite(wantedChain) && wantedChain > 0) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const parsed = readJson(path.join(dir, name));
      if (parsed && parsed.chainId === wantedChain) return path.join(dir, name);
    }
  }

  for (const name of ['localhost.json', 'hardhat.json']) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  const anyDeployment = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dir, name))
    .find((file) => readJson(file) !== null);
  return anyDeployment ?? null;
}

export function readDeployment(): Deployment {
  const file = findDeploymentFile();
  if (!file) {
    throw new Error(
      'Не найден файл деплоя (deployments/*.json). Разверните контракт: npm run chain && npm run deploy ' +
        '(или npm run deploy:sepolia для публичной сети).',
    );
  }
  const raw = readJson(file);
  if (!raw) throw new Error(`Некорректный адрес контракта в ${file}`);
  return raw;
}

/** Мягкая версия: возвращает null вместо исключения (для /api/health и рендера). */
export function tryReadDeployment(): Deployment | null {
  try {
    return readDeployment();
  } catch {
    return null;
  }
}
