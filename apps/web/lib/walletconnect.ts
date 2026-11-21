'use client';

/**
 * WalletConnect v2 — подключение кошелька на телефоне без встроенного браузера.
 *
 * Обычный Chrome/Safari на телефоне не даёт сайту window.ethereum, поэтому единственный
 * способ подписать транзакцию своим кошельком — WalletConnect: сайт показывает QR/диплинк,
 * MetaMask открывается, вы подтверждаете, и сессия возвращается в браузер.
 *
 * Project ID — публичный идентификатор приложения в Reown Cloud (не секрет), передаётся
 * через NEXT_PUBLIC_WC_PROJECT_ID и вшивается в бандл при сборке.
 */

export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';

export type Eip1193Like = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  /** У WalletConnect сессия поднимается через connect() (QR/диплинк), а не eth_requestAccounts */
  connect?: () => Promise<void>;
  disconnect?: () => Promise<void>;
  accounts?: string[];
  chainId?: number;
  session?: unknown;
  uri?: string;
};

let providerPromise: Promise<Eip1193Like> | null = null;

export function walletConnectEnabled(): boolean {
  return WC_PROJECT_ID.length > 0;
}

/** Ленивая инициализация: библиотека грузится только когда пользователь её выбрал. */
export async function getWalletConnectProvider(chainId: number): Promise<Eip1193Like> {
  if (!walletConnectEnabled()) {
    throw new Error('WalletConnect не настроен: нет NEXT_PUBLIC_WC_PROJECT_ID');
  }
  if (!providerPromise) {
    providerPromise = (async () => {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
      const origin =
        typeof window === 'undefined' ? 'https://justtld.local' : window.location.origin;
      const provider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [chainId],
        optionalChains: [chainId],
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        optionalMethods: [
          'eth_sign',
          'eth_signTypedData',
          'eth_signTypedData_v4',
          'personal_sign',
          'wallet_switchEthereumChain',
          'wallet_addEthereumChain',
        ],
        showQrModal: true,
        qrModalOptions: { themeMode: 'dark' },
        metadata: {
          name: 'JustTLD',
          description: 'Реестр доменных зон на EVM',
          url: origin,
          icons: [`${origin}/icon.svg`],
        },
      });
      return provider as unknown as Eip1193Like;
    })().catch((error: unknown) => {
      providerPromise = null;
      throw error;
    });
  }
  return providerPromise;
}

/** Сброс кэша — нужен при отключении и в тестах. */
export function resetWalletConnectProvider(): void {
  providerPromise = null;
}
