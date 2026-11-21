'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Copy, FlaskConical, LayoutDashboard, LogOut, Mail, Smartphone, Wallet } from 'lucide-react';
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
  compact?: boolean;
}) {
  const { t } = useI18n();
  const wallet = useWallet();
  const [open, setOpen] = React.useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = React.useState(false);
  const [devOpen, setDevOpen] = React.useState(false);
  const [devAccounts, setDevAccounts] = React.useState<DevWalletAccount[]>([]);
  const [devError, setDevError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const devEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_WALLET !== 'false';

  React.useEffect(() => {
    if (!open && !walletMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setWalletMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setWalletMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, walletMenuOpen]);

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
      <div ref={rootRef} className={cn('relative', className)}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWalletMenuOpen((v) => !v)}
          className={cn('mono gap-1.5 rounded-full', compact ? 'px-2.5 text-xs' : 'px-3')}
          aria-label={wallet.address}
          aria-expanded={walletMenuOpen}
        >
          <span
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', wallet.error ? 'bg-warning' : 'bg-success')}
          />
          <span>{compact ? shortenAddress(wallet.address, 2) : shortenAddress(wallet.address)}</span>
          {wallet.kind === 'dev' ? <FlaskConical className="h-3 w-3 shrink-0" /> : null}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>

        {walletMenuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
              <div className="mono truncate text-foreground">{shortenAddress(wallet.address, 6)}</div>
            </div>
            <div className="my-1 border-t border-border/60" />
            <button
              type="button"
              onClick={async () => {
                setWalletMenuOpen(false);
                await copyAddress();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/80"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              {t('common.copy')}
            </button>
            <Link
              href="/dashboard"
              onClick={() => setWalletMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/80"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
              {t('nav.dashboard')}
            </Link>
            <button
              type="button"
              onClick={() => {
                setWalletMenuOpen(false);
                wallet.disconnect();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('common.disconnect')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={compact ? t('common.connectWallet') : undefined}
        title={compact ? t('common.connectWallet') : undefined}
        disabled={wallet.status === 'connecting'}
      >
        <Wallet className="h-3.5 w-3.5" />
        {wallet.status === 'connecting' ? t('common.loading') : 'Войти'}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/80"
          >
            <span className="flex items-center gap-2 font-medium">
              <Mail className="h-3.5 w-3.5 text-primary" /> Google или Email
            </span>
            <span className="text-xs text-muted-foreground">
              Быстрый вход без криптокошелька
            </span>
          </Link>

          <div className="my-1 border-t border-border/60" />

          <button
            type="button"
            className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/80"
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
              className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/80"
              onClick={async () => {
                setOpen(false);
                await wallet.connectWalletConnect();
              }}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Smartphone className="h-3.5 w-3.5" /> MetaMask на телефоне
              </span>
              <span className="text-xs text-muted-foreground">
                WalletConnect QR или приложение
              </span>
            </button>
          )}

          {devEnabled && (
            <button
              type="button"
              className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/80"
              onClick={() => {
                setOpen(false);
                void openDevDialog();
              }}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <FlaskConical className="h-3.5 w-3.5" /> {t('common.devWallet')}
              </span>
              <span className="text-xs text-muted-foreground">
                Тестовые аккаунты Hardhat
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
              Публичные тестовые аккаунты Hardhat для локальной сети.
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
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-secondary/70"
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
