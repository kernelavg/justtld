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
import { getSession } from '@/lib/api';
import { cn } from '@/lib/utils';

const BASE_NAV: Array<{ href: string; key: TranslationKey }> = [
  { href: '/store', key: 'nav.store' },
  { href: '/zones', key: 'nav.zones' },
  { href: '/subdomains', key: 'nav.subdomains' },
  { href: '/dashboard', key: 'nav.dashboard' },
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
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    getSession()
      .then((res) => setIsAdmin(res.session?.role === 'admin'))
      .catch(() => undefined);

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

  const navItems = React.useMemo(
    () => (isAdmin ? [...BASE_NAV, { href: '/admin', key: 'nav.admin' as const }] : BASE_NAV),
    [isAdmin],
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-7">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <img
              src="/brand/icon.png"
              alt="JustTLD"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-[6px] ring-1 ring-white/15 transition-transform duration-150 group-hover:scale-[1.03]"
            />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight">
              Just<span className="brand-text-gradient">TLD</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active =
                pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-secondary/80 font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Язык и тема на десктопе/планшете; на телефоне перенесены внутрь бургер-меню, чтобы не теснить логотип */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden h-8 gap-1.5 px-2.5 text-[11px] font-medium uppercase sm:inline-flex"
            aria-label={t('common.language')}
            onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
            title={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span>{language}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label={t('common.theme')}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && resolvedTheme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
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
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="container flex flex-col gap-0.5 py-3">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                pathname === '/' ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {t('nav.home')}
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  pathname === item.href || pathname.startsWith(item.href)
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {t(item.key)}
              </Link>
            ))}

            <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-3 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs uppercase"
                onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
              >
                <Globe className="h-3.5 w-3.5" />
                {language === 'ru' ? 'Русский (RU)' : 'English (EN)'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {mounted && resolvedTheme === 'dark' ? (
                  <>
                    <Sun className="h-3.5 w-3.5" /> Светлая
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5" /> Тёмная
                  </>
                )}
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
