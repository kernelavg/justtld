#!/usr/bin/env node
/**
 * JustTLD — переключение окружения между сетями.
 *
 *   npm run net:sepolia    # приложение и indexer смотрят на Sepolia
 *   npm run net:mainnet    # mainnet (только осознанно, газ реальный)
 *   npm run net:localhost  # вернуться к локальной сети
 *   npm run net:status     # показать текущее окружение
 *
 * Скрипт меняет только «безопасные» ключи .env: CHAIN_ID, RPC_URL, DEPLOYMENT_NETWORK,
 * EXPLORER_TX_URL_TEMPLATE, INDEXER_* и флаги Dev Wallet. Приватный ключ деплоера
 * он не читает и не печатает.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

const NETWORKS = {
  localhost: {
    chainId: '31337',
    rpc: 'http://127.0.0.1:8545',
    chainName: 'JustTLD Local Devnet',
    explorer: '',
    devWallet: 'true',
    confirmations: '1',
    pollInterval: '1000',
  },
  sepolia: {
    chainId: '11155111',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    chainName: 'Sepolia Testnet',
    explorer: 'https://sepolia.etherscan.io/tx/{hash}',
    devWallet: 'false',
    confirmations: '3',
    pollInterval: '3000',
  },
  mainnet: {
    chainId: '1',
    rpc: '',
    chainName: 'Ethereum Mainnet',
    explorer: 'https://etherscan.io/tx/{hash}',
    devWallet: 'false',
    confirmations: '5',
    pollInterval: '12000',
  },
};

function parseEnvFile(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return { entries, text };
}

function setKey(state, key, value) {
  state.entries.set(key, value);
}

/** Сохраняет .env «как есть»: комментарии и порядок строк не теряются. */
function saveEnv(state) {
  const lines = state.text.split(/\r?\n/);
  const pending = new Map(state.entries);
  const result = lines.map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) result.push(`${key}=${value}`);
  fs.writeFileSync(ENV_PATH, `${result.join('\n').replace(/\n+$/, '')}\n`);
}

const command = process.argv[2] ?? 'status';

if (command === 'status') {
  const state = parseEnvFile(ENV_PATH);
  const deployment = [
    'deployments/sepolia.json',
    'deployments/mainnet.json',
    'deployments/localhost.json',
  ]
    .map((relative) => path.join(ROOT, relative))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return `  ${path.basename(file).padEnd(16)} chainId ${String(data.chainId).padEnd(9)} ${data.address}  owner ${data.owner}`;
    });
  console.log('[net] текущее окружение:');
  for (const key of [
    'DEPLOYMENT_NETWORK',
    'CHAIN_ID',
    'RPC_URL',
    'NEXT_PUBLIC_ENABLE_DEV_WALLET',
    'INDEXER_CONFIRMATIONS',
  ]) {
    console.log(`  ${key}=${state.entries.get(key) ?? '(не задано)'}`);
  }
  console.log('[net] найденные деплои:');
  console.log(deployment.length ? deployment.join('\n') : '  (нет)');
  process.exit(0);
}

const network = command.replace(/^net:/, '');
const config = NETWORKS[network];
if (!config) {
  console.error(
    `[net] неизвестная сеть: ${network}. Доступно: ${Object.keys(NETWORKS).join(', ')}`,
  );
  process.exit(1);
}

const state = parseEnvFile(ENV_PATH);
const rpcKey =
  network === 'sepolia' ? 'SEPOLIA_RPC_URL' : network === 'mainnet' ? 'MAINNET_RPC_URL' : null;
const rpc = rpcKey ? (state.entries.get(rpcKey) ?? config.rpc) : config.rpc;

if (!rpc) {
  console.error(`[net] не задан RPC для ${network}: заполните MAINNET_RPC_URL в .env`);
  process.exit(1);
}

setKey(state, 'DEPLOYMENT_NETWORK', network);
setKey(state, 'CHAIN_ID', config.chainId);
setKey(state, 'RPC_URL', rpc);
setKey(state, 'NEXT_PUBLIC_CHAIN_ID', config.chainId);
setKey(state, 'NEXT_PUBLIC_CHAIN_NAME', `"${config.chainName}"`);
setKey(state, 'NEXT_PUBLIC_ENABLE_DEV_WALLET', config.devWallet);
setKey(state, 'ENABLE_DEV_WALLET', config.devWallet);
setKey(state, 'EXPLORER_TX_URL_TEMPLATE', config.explorer);
setKey(state, 'INDEXER_CONFIRMATIONS', config.confirmations);
setKey(state, 'INDEXER_POLL_INTERVAL_MS', config.pollInterval);

if (network !== 'localhost') {
  const deploymentFile = path.join(ROOT, 'deployments', `${network}.json`);
  if (!fs.existsSync(deploymentFile)) {
    console.warn(
      `[net] внимание: deployments/${network}.json ещё нет — сначала выполните npm run deploy:${network}`,
    );
  } else {
    const data = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    setKey(state, 'ADMIN_ADDRESS', data.owner);
    console.log(`[net] контракт ${data.address} (owner ${data.owner})`);
  }
}

saveEnv(state);

console.log(`[net] переключено на ${network}: chainId ${config.chainId}, RPC ${rpc}`);
console.log('[net] перезапустите сервисы: npm run stop:all && npm run start:all');
