'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Globe, Menu, Moon, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { ConnectWallet } from '@/components/wallet/connect-wallet';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; key: TranslationKey }> = [
  { href: '/', key: 'nav.home' },
  { href: '/store', key: 'nav.store' },
  { href: '/zones', key: 'nav.zones' },
  { href: '/subdomains', key: 'nav.subdomains' },
  { href: '/register', key: 'nav.register' },
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/admin', key: 'nav.admin' },
  { href: '/docs', key: 'nav.docs' },
];

const GOOGLE_AUTH_ERRORS: Record<string, string> = {
  google_not_configured:
    'Google Auth пока не настроен на сервере (нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET)',
  google_cancelled: 'Вход через Google отменён',
  google_invalid_state: 'Истекла сессия авторизации Google — попробуйте ещё раз',
  google_token_failed: 'Не удалось завершить вход через Google',
  google_token_missing: 'Google не выдал токен доступа',
  google_profile_failed: 'Не удалось получить профиль Google',
  google_email_unverified: 'Email в Google-аккаунте должен быть подтверждён',
};

export function SiteHeader() {
  const { t, language, setLanguage } = useI18n();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    const err = params.get('auth_error');
    if (auth === 'google') {
      toast.success('Вход через Google выполнен');
      params.delete('auth');
      const next = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${next ? `?${next}` : ''}`,
      );
    } else if (err) {
      toast.error(GOOGLE_AUTH_ERRORS[err] ?? 'Ошибка входа через Google');
      params.delete('auth_error');
      const next = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${next ? `?${next}` : ''}`,
      );
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-3">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold">
          <img
            src="/brand/icon.png"
            alt="JustTLD"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-white/10 transition-transform duration-150 group-hover:scale-105"
          />
          <span className="text-[17px] font-bold tracking-tight">
            Just<span className="brand-text-gradient">TLD</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 hover:text-foreground',
                  active
                    ? 'bg-secondary font-medium text-foreground shadow-sm ring-1 ring-border/70'
                    : 'text-muted-foreground',
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
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-xl lg:hidden">
          <nav className="container flex flex-col gap-1 py-3">
            {NAV.map((item) => {
              const active =
                pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60',
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
            <div className="px-2 pt-2 sm:hidden">
              <ConnectWallet />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
