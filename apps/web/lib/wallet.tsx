'use client';

import * as React from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { UnsignedTx } from '@justtld/shared';
import { getDevWallets } from './api';
import {
  getWalletConnectProvider,
  resetWalletConnectProvider,
  walletConnectEnabled,
} from './walletconnect';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

function rpcEndpoint(): string {
  if (typeof window === 'undefined') return '/api/rpc';
  return `${window.location.origin}/api/rpc`;
}

export const justtldChain = defineChain({
  id: CHAIN_ID,
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'JustTLD Local Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['/api/rpc'] } },
  testnet: true,
});

export type WalletKind = 'injected' | 'dev' | 'walletconnect';
export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type WalletState = {
  status: WalletStatus;
  address: `0x${string}` | null;
  kind: WalletKind | null;
  label: string | null;
  chainId: number | null;
  error: string | null;
};

type WalletContextValue = WalletState & {
  publicClient: PublicClient;
  hasInjected: boolean;
  hasWalletConnect: boolean;
  connectInjected: () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  connectDev: (index: number) => Promise<void>;
  disconnect: () => void;
  sendTransaction: (tx: UnsignedTx) => Promise<Hex>;
  signMessage: (message: string) => Promise<Hex>;
  ensureChain: () => Promise<void>;
};

const WalletContext = React.createContext<WalletContextValue | null>(null);
const STORAGE_KEY = 'justtld.wallet';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  /** есть у WalletConnect-провайдера, у window.ethereum — нет */
  disconnect?: () => Promise<void>;
  connect?: () => Promise<void>;
  accounts?: string[];
  chainId?: number;
};

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const publicClient = React.useMemo<PublicClient>(
    () =>
      createPublicClient({
        chain: justtldChain,
        transport: http(rpcEndpoint(), { timeout: 20_000, retryCount: 1 }),
      }) as PublicClient,
    [],
  );

  const [state, setState] = React.useState<WalletState>({
    status: 'disconnected',
    address: null,
    kind: null,
    label: null,
    chainId: null,
    error: null,
  });
  const [hasInjected, setHasInjected] = React.useState(false);
  const devAccountRef = React.useRef<ReturnType<typeof privateKeyToAccount> | null>(null);
  const wcProviderRef = React.useRef<Eip1193Provider | null>(null);

  /** Провайдер активного подключения: injected — из окна, WalletConnect — сессионный. */
  const activeProvider = React.useCallback((): Eip1193Provider | null => {
    if (wcProviderRef.current) return wcProviderRef.current;
    return getInjectedProvider();
  }, []);

  const ensureChain = React.useCallback(async () => {
    const provider = activeProvider();
    if (!provider) return;
    const current = (await provider.request({ method: 'eth_chainId' })) as string;
    if (Number.parseInt(current, 16) === CHAIN_ID) return;
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
      });
    } catch {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${CHAIN_ID.toString(16)}`,
            chainName: justtldChain.name,
            nativeCurrency: justtldChain.nativeCurrency,
            rpcUrls: [rpcEndpoint()],
          },
        ],
      });
    }
  }, [activeProvider]);

  const connectInjected = React.useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'NO_INJECTED_WALLET',
      }));
      return;
    }
    setState((prev) => ({ ...prev, status: 'connecting', error: null }));
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0] as `0x${string}` | undefined;
      if (!address) throw new Error('Кошелёк не вернул адрес');
      await ensureChain();
      const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const chainId = Number.parseInt(chainHex, 16);
      devAccountRef.current = null;
      setState({
        status: 'connected',
        address,
        kind: 'injected',
        label: 'Browser wallet',
        chainId,
        error: chainId === CHAIN_ID ? null : 'WRONG_NETWORK',
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'injected' }));
    } catch (error) {
      setState({
        status: 'error',
        address: null,
        kind: null,
        label: null,
        chainId: null,
        error: (error as Error).message,
      });
    }
  }, [ensureChain]);

  const connectWalletConnect = React.useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'connecting', error: null }));
    try {
      const provider = await getWalletConnectProvider(CHAIN_ID);
      wcProviderRef.current = provider;
      provider.on?.('accountsChanged', (accounts) => {
        const next = (accounts as string[])?.[0];
        if (!next) {
          window.localStorage.removeItem(STORAGE_KEY);
          setState({
            status: 'disconnected',
            address: null,
            kind: null,
            label: null,
            chainId: null,
            error: null,
          });
          return;
        }
        setState((prev) => ({ ...prev, address: next as `0x${string}` }));
      });
      provider.on?.('disconnect', () => {
        wcProviderRef.current = null;
        resetWalletConnectProvider();
        window.localStorage.removeItem(STORAGE_KEY);
        setState({
          status: 'disconnected',
          address: null,
          kind: null,
          label: null,
          chainId: null,
          error: null,
        });
      });

      // WalletConnect требует явного connect(): он показывает QR/диплинк и ждёт подтверждения.
      if (!provider.session) {
        if (!provider.connect)
          throw new Error('WalletConnect: провайдер не поддерживает connect()');
        await provider.connect();
      }
      const accounts = provider.accounts?.length
        ? provider.accounts
        : ((await provider.request({ method: 'eth_accounts' })) as string[]);
      const address = accounts[0] as `0x${string}` | undefined;
      if (!address) throw new Error('Кошелёк не вернул адрес');
      const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const chainId = Number.parseInt(chainHex, 16);
      devAccountRef.current = null;
      setState({
        status: 'connected',
        address,
        kind: 'walletconnect',
        label: 'WalletConnect',
        chainId,
        error: chainId === CHAIN_ID ? null : 'WRONG_NETWORK',
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'walletconnect' }));
    } catch (error) {
      wcProviderRef.current = null;
      const message = (error as Error).message ?? String(error);
      const rejected = /reject|denied|closed|cancel/i.test(message);
      setState({
        status: 'error',
        address: null,
        kind: null,
        label: null,
        chainId: null,
        error: rejected ? 'CONNECTION_CANCELLED' : message,
      });
    }
  }, []);

  const connectDev = React.useCallback(
    async (index: number) => {
      setState((prev) => ({ ...prev, status: 'connecting', error: null }));
      try {
        const { accounts } = await getDevWallets();
        const account = accounts[index];
        if (!account) throw new Error('Dev-аккаунт не найден');
        const signer = privateKeyToAccount(account.privateKey as Hex);
        devAccountRef.current = signer;
        const chainId = await publicClient.getChainId();
        setState({
          status: 'connected',
          address: signer.address,
          kind: 'dev',
          label: account.label,
          chainId,
          error: chainId === CHAIN_ID ? null : 'WRONG_NETWORK',
        });
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'dev', index }));
      } catch (error) {
        setState({
          status: 'error',
          address: null,
          kind: null,
          label: null,
          chainId: null,
          error: (error as Error).message,
        });
      }
    },
    [publicClient],
  );

  const disconnect = React.useCallback(() => {
    devAccountRef.current = null;
    if (wcProviderRef.current) {
      void wcProviderRef.current.disconnect?.().catch(() => undefined);
      wcProviderRef.current = null;
      resetWalletConnectProvider();
    }
    window.localStorage.removeItem(STORAGE_KEY);
    setState({
      status: 'disconnected',
      address: null,
      kind: null,
      label: null,
      chainId: null,
      error: null,
    });
  }, []);

  const sendTransaction = React.useCallback(
    async (tx: UnsignedTx): Promise<Hex> => {
      if (!state.address) throw new Error('Кошелёк не подключён');
      if (state.kind === 'dev') {
        const account = devAccountRef.current;
        if (!account) throw new Error('Dev-кошелёк не инициализирован');
        const walletClient = createWalletClient({
          account,
          chain: justtldChain,
          transport: http(rpcEndpoint()),
        });
        return walletClient.sendTransaction({
          account,
          chain: justtldChain,
          to: tx.to as `0x${string}`,
          data: tx.data as Hex,
          value: BigInt(tx.value ?? '0'),
        });
      }

      const provider = activeProvider();
      if (!provider) throw new Error('NO_INJECTED_WALLET');
      await ensureChain();
      const walletClient = createWalletClient({
        chain: justtldChain,
        transport: custom(provider),
      });
      return walletClient.sendTransaction({
        account: state.address,
        chain: justtldChain,
        to: tx.to as `0x${string}`,
        data: tx.data as Hex,
        value: BigInt(tx.value ?? '0'),
      });
    },
    [activeProvider, ensureChain, state.address, state.kind],
  );

  const signMessage = React.useCallback(
    async (message: string): Promise<Hex> => {
      if (!state.address) throw new Error('Кошелёк не подключён');
      if (state.kind === 'dev') {
        const account = devAccountRef.current;
        if (!account) throw new Error('Dev-кошелёк не инициализирован');
        return account.signMessage({ message });
      }
      const provider = activeProvider();
      if (!provider) throw new Error('NO_INJECTED_WALLET');
      const walletClient = createWalletClient({ chain: justtldChain, transport: custom(provider) });
      return walletClient.signMessage({ account: state.address, message });
    },
    [activeProvider, state.address, state.kind],
  );

  // Автоподключение сохранённого кошелька.
  React.useEffect(() => {
    setHasInjected(Boolean(getInjectedProvider()));
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { kind?: WalletKind; index?: number };
      if (parsed.kind === 'dev' && typeof parsed.index === 'number') {
        void connectDev(parsed.index);
      } else if (parsed.kind === 'injected' && getInjectedProvider()) {
        void connectInjected();
      } else if (parsed.kind === 'walletconnect' && walletConnectEnabled()) {
        void connectWalletConnect();
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Реакция на смену аккаунта/сети в браузерном кошельке.
  React.useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider?.on) return;
    const handleAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts?.length) {
        disconnect();
        return;
      }
      setState((prev) =>
        prev.kind === 'injected' ? { ...prev, address: accounts[0] as `0x${string}` } : prev,
      );
    };
    const handleChain = (...args: unknown[]) => {
      const chainId = Number.parseInt(String(args[0]), 16);
      setState((prev) =>
        prev.kind === 'injected'
          ? { ...prev, chainId, error: chainId === CHAIN_ID ? null : 'WRONG_NETWORK' }
          : prev,
      );
    };
    provider.on('accountsChanged', handleAccounts);
    provider.on('chainChanged', handleChain);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccounts);
      provider.removeListener?.('chainChanged', handleChain);
    };
  }, [disconnect]);

  const value = React.useMemo<WalletContextValue>(
    () => ({
      ...state,
      publicClient,
      hasInjected,
      hasWalletConnect: walletConnectEnabled(),
      connectInjected,
      connectWalletConnect,
      connectDev,
      disconnect,
      sendTransaction,
      signMessage,
      ensureChain,
    }),
    [
      state,
      publicClient,
      hasInjected,
      connectInjected,
      connectWalletConnect,
      connectDev,
      disconnect,
      sendTransaction,
      signMessage,
      ensureChain,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = React.useContext(WalletContext);
  if (!context) throw new Error('useWallet должен использоваться внутри WalletProvider');
  return context;
}
