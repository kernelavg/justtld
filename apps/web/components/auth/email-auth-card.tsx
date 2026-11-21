'use client';

import * as React from 'react';
import { KeyRound, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { AccountDto } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { loginWithEmail, registerWithEmail, type SessionResponse } from '@/lib/api';

type Props = {
  title?: string;
  description?: string;
  onSuccess?: (result: {
    session: NonNullable<SessionResponse['session']>;
    account: AccountDto;
  }) => void;
};

export function EmailAuthCard({ title, description, onSuccess }: Props) {
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

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
      <CardContent>
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
