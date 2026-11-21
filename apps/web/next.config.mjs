import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Загружаем корневой .env монорепо (единый источник конфигурации).
const envFile = path.resolve(currentDir, '../../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] ?? '').trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@justtld/shared', '@justtld/db'],
  serverExternalPackages: ['pg'],
  outputFileTracingRoot: path.resolve(currentDir, '../../'),
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337',
    NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'JustTLD Local Devnet',
    NEXT_PUBLIC_ENABLE_DEV_WALLET: process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET ?? 'true',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_RESOLVER_DOMAIN:
      process.env.RESOLVER_DOMAIN ?? process.env.NEXT_PUBLIC_RESOLVER_DOMAIN ?? 'justtld.online',
  },
};

export default nextConfig;
