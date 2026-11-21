import { loadRootEnv } from '@justtld/shared/env';
import {
  tryReadDeployment,
  tryReadSubdomainsDeployment,
  type Deployment,
  type SubdomainsDeployment,
} from '@justtld/shared/deployment';

loadRootEnv();

export function deployment(): Deployment | null {
  return tryReadDeployment();
}

export function registryAddress(): `0x${string}` {
  const dep = deployment();
  if (!dep) {
    throw new Error(
      'Контракт не развёрнут: выполните `npm run deploy` (файл deployments/localhost.json)',
    );
  }
  return dep.address;
}

/** Деплой контракта поддоменов (может отсутствовать — тогда API отвечает 501). */
export function subdomainsDeployment(): SubdomainsDeployment | null {
  return tryReadSubdomainsDeployment();
}

export function subdomainsAddress(): `0x${string}` {
  const dep = subdomainsDeployment();
  if (!dep) {
    throw new Error('Контракт поддоменов не развёрнут: deployments/<сеть>.subdomains.json');
  }
  return dep.address;
}

export function subdomainsEnabled(): boolean {
  return subdomainsDeployment() !== null;
}

export function rpcUrl(): string {
  return process.env.RPC_URL ?? 'http://127.0.0.1:8545';
}

export function chainId(): number {
  return Number(process.env.CHAIN_ID ?? deployment()?.chainId ?? 31337);
}

export function chainName(): string {
  return process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'JustTLD Local Devnet';
}

/** Адрес администратора: env ADMIN_ADDRESS, иначе owner контракта. */
export function adminAddress(): string | null {
  const configured = process.env.ADMIN_ADDRESS?.trim().toLowerCase();
  if (configured && /^0x[0-9a-f]{40}$/.test(configured)) return configured;
  const owner = deployment()?.owner;
  return owner ? owner.toLowerCase() : null;
}

export function explorerTxUrlTemplate(): string | null {
  const template = process.env.EXPLORER_TX_URL_TEMPLATE?.trim();
  return template && template.includes('{hash}') ? template : null;
}

export function devWalletEnabled(): boolean {
  return (process.env.ENABLE_DEV_WALLET ?? 'true') === 'true' && chainId() === 31337;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Dev-фолбэк: детерминированный секрет, чтобы сессии выживали перезапуск.
  return 'justtld-dev-session-secret-please-change-in-production';
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export function rateLimits() {
  return {
    read: Number(process.env.RATE_LIMIT_READ ?? 240),
    write: Number(process.env.RATE_LIMIT_WRITE ?? 30),
    auth: Number(process.env.RATE_LIMIT_AUTH ?? 10),
    admin: Number(process.env.RATE_LIMIT_ADMIN ?? 20),
  };
}

export function resolverDomain(): string {
  return (process.env.RESOLVER_DOMAIN ?? 'justtld.online').trim().toLowerCase();
}

export function cfApiToken(): string {
  return (process.env.CF_API_TOKEN ?? '').trim();
}

export function cfZoneId(): string {
  return (process.env.CF_ZONE_ID ?? '').trim();
}

export function yoomoneyWallet(): string {
  return (process.env.YOOMONEY_WALLET ?? '').trim();
}

export function yoomoneySecret(): string {
  return (process.env.YOOMONEY_SECRET ?? '').trim();
}

export function cryptoBotToken(): string {
  return (process.env.CRYPTOBOT_API_TOKEN ?? '').trim();
}

export function paymentsSandbox(): boolean {
  return process.env.PAYMENTS_SANDBOX === 'true' || (!yoomoneyWallet() && !cryptoBotToken());
}

export function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').trim();
}

export function googleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
}

export function googleAuthEnabled(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}
