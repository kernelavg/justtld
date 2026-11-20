import fs from 'node:fs';
import path from 'node:path';
import { HardhatUserConfig } from 'hardhat/config';

// Загружаем корневой .env и (если есть) .env.secrets — приватные значения публичного деплоя.
const envFiles = [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../.env.secrets')];
for (const envFile of envFiles) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // .env.secrets идёт вторым и перекрывает .env, но только непустым значением.
    if (value !== '' && (process.env[key] === undefined || envFile.endsWith('.env.secrets'))) {
      process.env[key] = value;
    }
  }
}
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-network-helpers';
import '@nomicfoundation/hardhat-verify';

/**
 * Приватный ключ деплоера читается ТОЛЬКО из окружения (.env, вне git).
 * Для публичных сетей используйте отдельный «burner»-кошелёк без реальных средств,
 * кроме суммы на газ.
 */
const deployerAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [
      process.env.DEPLOYER_PRIVATE_KEY.startsWith('0x')
        ? process.env.DEPLOYER_PRIVATE_KEY
        : `0x${process.env.DEPLOYER_PRIVATE_KEY}`,
    ]
  : undefined;

// Пустые значения в .env.secrets — это «не задано», поэтому используем ||, а не ??.
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com';
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL?.trim() || '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Локальная dev-сеть: блок майнится на каждую транзакцию.
      mining: { auto: true, interval: 0 },
      allowUnlimitedContractSize: false,
    },
    localhost: {
      url: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
      chainId: 31337,
      // Публичные тестовые аккаунты Hardhat (dev-only, никаких реальных средств).
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: "m/44'/60'/0'/0",
        count: 20,
      },
      timeout: 120000,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: deployerAccounts ?? [],
      timeout: 180000,
    },
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts: deployerAccounts ?? [],
      timeout: 180000,
    },
  },
  etherscan: {
    // Etherscan API v2: один ключ работает для всех сетей (etherscan.io → API Keys).
    apiKey: process.env.ETHERSCAN_API_KEY ?? '',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
