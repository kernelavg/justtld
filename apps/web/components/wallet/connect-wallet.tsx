'use client';

import * as React from 'react';
import { ChevronDown, Copy, LogOut, Wallet, FlaskConical, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { shortenAddress } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { getDevWallets, type DevWalletAccount } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ConnectWallet({
  className,
  compact = false,
}: {
  className?: string;
  /** Только иконка — для узких экранов, где подпись не помещается. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const wallet = useWallet();
  const [open, setOpen] = React.useState(false);
  const [devOpen, setDevOpen] = React.useState(false);
  const [devAccounts, setDevAccounts] = React.useState<DevWalletAccount[]>([]);
  const [devError, setDevError] = React.useState<string | null>(null);
  const devEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET !== 'false';

  const openDevDialog = async () => {
    setDevOpen(true);
    setDevError(null);
    try {
      const { accounts } = await getDevWallets();
      setDevAccounts(accounts);
    } catch (error) {
      setDevError(error instanceof Error ? error.message : t('error.unknown'));
    }
  };

  const copyAddress = async () => {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    toast.success(t('common.copied'));
  };

  if (wallet.status === 'connected' && wallet.address) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button
          variant="outline"
          size="sm"
          onClick={copyAddress}
          className={cn('mono gap-2', compact && 'px-2')}
          aria-label={wallet.address}
        >
          <span
            className={cn('h-2 w-2 rounded-full', wallet.error ? 'bg-warning' : 'bg-success')}
          />
          {compact ? null : shortenAddress(wallet.address)}
          {wallet.kind === 'dev' ? <FlaskConical className="h-3 w-3" /> : null}
          {compact ? null : <Copy className="h-3 w-3 opacity-60" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.disconnect')}
          onClick={wallet.disconnect}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={compact ? t('common.connectWallet') : undefined}
        title={compact ? t('common.connectWallet') : undefined}
        disabled={wallet.status === 'connecting'}
      >
        <Wallet className="h-4 w-4" />
        {compact
          ? null
          : wallet.status === 'connecting'
            ? t('common.loading')
            : t('common.connectWallet')}
        {compact ? null : <ChevronDown className="h-3 w-3 opacity-70" />}
      </Button>

      {open && (
        <div className="absolute right-4 z-50 mt-2 w-72 rounded-lg border bg-card p-2 shadow-lg">
          <button
            type="button"
            className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={async () => {
              setOpen(false);
              await wallet.connectInjected();
            }}
          >
            <span className="font-medium">{t('common.injectedWallet')}</span>
            <span className="text-xs text-muted-foreground">
              {wallet.hasInjected ? 'MetaMask / Rabby / Coinbase' : t('common.noWallet')}
            </span>
          </button>

          {wallet.hasWalletConnect && (
            <button
              type="button"
              className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={async () => {
                setOpen(false);
                await wallet.connectWalletConnect();
              }}
            >
              <span className="flex items-center gap-1 font-medium">
                <Smartphone className="h-3.5 w-3.5" /> MetaMask на телефоне
              </span>
              <span className="text-xs text-muted-foreground">
                WalletConnect: QR-код или открыть приложение
              </span>
            </button>
          )}

          {devEnabled && (
            <button
              type="button"
              className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setOpen(false);
                void openDevDialog();
              }}
            >
              <span className="flex items-center gap-1 font-medium">
                <FlaskConical className="h-3.5 w-3.5" /> {t('common.devWallet')}
              </span>
              <span className="text-xs text-muted-foreground">
                Тестовые аккаунты Hardhat (chainId 31337)
              </span>
            </button>
          )}

          {wallet.error && (
            <p className="px-3 py-2 text-xs text-destructive">
              {wallet.error === 'NO_INJECTED_WALLET'
                ? t('common.noWallet')
                : wallet.error === 'CONNECTION_CANCELLED'
                  ? 'Подключение отменено'
                  : wallet.error}
            </p>
          )}
        </div>
      )}

      <Dialog open={devOpen} onOpenChange={setDevOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.devWallet')}</DialogTitle>
            <DialogDescription>
              Публичные тестовые аккаунты Hardhat для локальной сети. Ключи известны всем — никогда
              не используйте их с реальными средствами. Подпись транзакции выполняется локально в
              браузере.
            </DialogDescription>
          </DialogHeader>

          {devError ? (
            <p className="text-sm text-destructive">{devError}</p>
          ) : (
            <div className="space-y-2">
              {devAccounts.map((account, index) => (
                <button
                  key={account.address}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={async () => {
                    setDevOpen(false);
                    await wallet.connectDev(index);
                  }}
                >
                  <span>{account.label}</span>
                  <span className="mono text-xs text-muted-foreground">
                    {shortenAddress(account.address)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDevOpen(false)}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
