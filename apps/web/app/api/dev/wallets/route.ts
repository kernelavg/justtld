import { jsonResponse, route } from '@/lib/server/http';
import { devWalletEnabled } from '@/lib/server/config';
import { ApiError } from '@justtld/shared';

export const dynamic = 'force-dynamic';

/**
 * Dev-only: публично известные тестовые аккаунты Hardhat.
 * Это НЕ пользовательские ключи: они документированы в самом Hardhat и не хранят реальных средств.
 * Маршрут отключён, если ENABLE_DEV_WALLET=false или сеть не 31337.
 */
const DEV_ACCOUNTS = [
  {
    label: 'Hardhat #0 · admin/deployer',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    label: 'Hardhat #1 · alice',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    label: 'Hardhat #2 · bob',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
];

export const GET = route(
  async () => {
    if (!devWalletEnabled()) {
      throw ApiError.forbidden('Dev-кошелёк отключён (ENABLE_DEV_WALLET=false или сеть не 31337)');
    }
    return jsonResponse({
      enabled: true,
      warning:
        'Это публично известные тестовые ключи Hardhat для локальной сети chainId 31337. Никогда не используйте их с реальными средствами.',
      accounts: DEV_ACCOUNTS,
    });
  },
  { limit: 'read', bucket: 'dev-wallets' },
);
