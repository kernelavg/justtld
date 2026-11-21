'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { KeyRound, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountDto } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import {
  getSession,
  loginWithEmail,
  registerWithEmail,
  type SessionResponse,
} from '@/lib/api';

type Props = {
  title?: string;
  description?: string;
  googleAuthEnabled?: boolean;
  onSuccess?: (result: {
    session: NonNullable<SessionResponse['session']>;
    account: AccountDto;
  }) => void;
};

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

const GOOGLE_AUTH_ERRORS: Record<string, string> = {
  google_not_configured: 'Google Auth пока не настроен на сервере (нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET)',
  google_cancelled: 'Вход через Google отменён',
  google_invalid_state: 'Истекла сессия авторизации Google — попробуйте ещё раз',
  google_token_failed: 'Не удалось завершить вход через Google',
  google_token_missing: 'Google не выдал токен доступа',
  google_profile_failed: 'Не удалось получить профиль Google',
  google_email_unverified: 'Email в Google-аккаунте должен быть подтверждён',
};

export function EmailAuthCard({
  title,
  description,
  googleAuthEnabled: googleEnabledProp,
  onSuccess,
}: Props) {
  const pathname = usePathname() || '/store';
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [googleEnabled, setGoogleEnabled] = React.useState<boolean>(googleEnabledProp ?? false);

  React.useEffect(() => {
    if (typeof googleEnabledProp === 'boolean') {
      setGoogleEnabled(googleEnabledProp);
      return;
    }
    getSession()
      .then((res) => setGoogleEnabled(Boolean(res.googleAuthEnabled)))
      .catch(() => undefined);
  }, [googleEnabledProp]);

  const handleGoogleClick = () => {
    if (!googleEnabled) {
      toast.info(GOOGLE_AUTH_ERRORS.google_not_configured);
      return;
    }
    window.location.href = `/api/auth/google?next=${encodeURIComponent(pathname)}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res =
        mode === 'register'
          ? await registerWithEmail({
              email: email.trim(),
              password,
              displayName: displayName.trim() || undefined,
            })
          : await loginWithEmail({
              email: email.trim(),
              password,
            });
      toast.success(
        mode === 'register'
          ? 'Аккаунт создан и выполнен вход'
          : 'Вход в аккаунт выполнен',
      );
      onSuccess?.({ session: res.session, account: res.account });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" />
              {title ?? 'Вход по Email и паролю'}
            </CardTitle>
            <CardDescription className="mt-1">
              {description ??
                'Покупайте зоны, управляйте сайтами и DNS без установки криптокошелька.'}
            </CardDescription>
          </div>
          <div className="flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Регистрация
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleClick}
          className="h-10 w-full gap-2.5 border-border/80 bg-background/70 font-medium hover:bg-accent/70"
        >
          <GoogleIcon />
          Продолжить через Google
        </Button>

        <div className="relative flex items-center py-0.5">
          <div className="flex-grow border-t border-border/70" />
          <span className="mx-3 shrink text-[11px] uppercase tracking-wider text-muted-foreground">
            или по Email
          </span>
          <div className="flex-grow border-t border-border/70" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Имя (необязательно)</Label>
              <Input
                id="auth-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Иван / Название проекта"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Пароль</Label>
            <Input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full gap-2">
            {mode === 'register' ? (
              <UserPlus className="h-4 w-4" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {busy
              ? 'Подождите…'
              : mode === 'register'
                ? 'Создать аккаунт и войти'
                : 'Войти по Email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
