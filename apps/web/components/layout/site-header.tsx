'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Globe, Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { ConnectWallet } from '@/components/wallet/connect-wallet';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; key: TranslationKey }> = [
  { href: '/', key: 'nav.home' },
  { href: '/zones', key: 'nav.zones' },
  { href: '/subdomains', key: 'nav.subdomains' },
  { href: '/register', key: 'nav.register' },
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/admin', key: 'nav.admin' },
  { href: '/docs', key: 'nav.docs' },
];

export function SiteHeader() {
  const { t, language, setLanguage } = useI18n();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="container flex h-16 items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            ⬢
          </span>
          <span className="text-base tracking-tight">JustTLD</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.language')}
            onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
            title={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}
          >
            <span className="flex items-center gap-1 text-xs font-semibold uppercase">
              <Globe className="h-4 w-4" />
              {language}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.theme')}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          <div className="hidden sm:block">
            <ConnectWallet />
          </div>

          {/* На телефоне подпись не помещается — оставляем иконку, чтобы подключение было в один тап. */}
          <div className="sm:hidden">
            <ConnectWallet compact />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background lg:hidden">
          <nav className="container flex flex-col py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm',
                  pathname === item.href ? 'bg-accent font-medium' : 'text-muted-foreground',
                )}
              >
                {t(item.key)}
              </Link>
            ))}
            <div className="px-3 py-2 sm:hidden">
              <ConnectWallet />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
