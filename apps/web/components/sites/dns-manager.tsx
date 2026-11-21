'use client';

import * as React from 'react';
import { Network, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DnsRecordDto, DnsRecordType } from '@justtld/shared';
import {
  createDnsRecord,
  deleteDnsRecordApi,
  getDnsRecords,
  getSiteSubdomains,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle, Label } from '@/components/ui/primitives';

type Props = {
  tld: string;
  isOwner: boolean;
  hasSession: boolean;
  onRequireAuth?: () => void;
};

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'];

export function DnsManager({ tld, isOwner, hasSession, onRequireAuth }: Props) {
  const [subLabel, setSubLabel] = React.useState('');
  const [subOptions, setSubOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [fqdn, setFqdn] = React.useState('');
  const [serverIp, setServerIp] = React.useState('95.182.89.37');
  const [cfConfigured, setCfConfigured] = React.useState(false);
  const [cfError, setCfError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<DnsRecordDto[]>([]);
  const [cfRecords, setCfRecords] = React.useState<
    Array<{ id: string; type: string; name: string; content: string; ttl: number; proxied?: boolean }>
  >([]);

  const [type, setType] = React.useState<DnsRecordType>('A');
  const [content, setContent] = React.useState('');
  const [ttl, setTtl] = React.useState('300');
  const [priority, setPriority] = React.useState('10');

  const cleanTld = tld.replace(/^\./, '');

  React.useEffect(() => {
    getSiteSubdomains(tld)
      .then((res) => {
        const names = new Set<string>();
        for (const s of res.onchain) names.add(s.label);
        for (const c of res.custody) if (c.subLabel) names.add(c.subLabel);
        setSubOptions(Array.from(names).sort());
      })
      .catch(() => setSubOptions([]));
  }, [tld]);

  const loadDns = React.useCallback(async () => {
    if (!hasSession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getDnsRecords(tld, subLabel);
      setFqdn(res.fqdn);
      setServerIp(res.serverIp);
      setCfConfigured(res.cloudflareConfigured);
      setCfError(res.cloudflareError);
      setRecords(res.records);
      setCfRecords(res.cloudflareRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить DNS-записи');
    } finally {
      setLoading(false);
    }
  }, [hasSession, tld, subLabel]);

  React.useEffect(() => {
    void loadDns();
  }, [loadDns]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createDnsRecord({
        tld,
        subLabel,
        recordType: type,
        content: content.trim(),
        ttl: Number(ttl) || 300,
        priority: type === 'MX' ? Number(priority) || 10 : null,
      });
      toast.success(
        res.synced
          ? `DNS-запись ${res.record.recordType} создана и синхронизирована с Cloudflare`
          : `DNS-запись ${res.record.recordType} сохранена в базе`,
      );
      setContent('');
      await loadDns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать DNS-запись');
    } finally {
      setBusy(false);
    }
  };

  const removeRecord = async (id: string) => {
    setBusy(true);
    try {
      await deleteDnsRecordApi(tld, id, subLabel);
      toast.success('DNS-запись удалена');
      await loadDns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка удаления DNS-записи');
    } finally {
      setBusy(false);
    }
  };

  if (!hasSession) {
    return (
      <Alert>
        <Network className="h-4 w-4" />
        <AlertTitle>Требуется авторизация владельца</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>Для управления DNS-записями зоны {tld} необходимо войти в аккаунт владельца.</span>
          {onRequireAuth && (
            <Button size="sm" onClick={onRequireAuth}>
              Войти
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!isOwner) {
    return (
      <Alert>
        <Network className="h-4 w-4" />
        <AlertTitle>Только для владельца зоны</AlertTitle>
        <AlertDescription>
          Редактирование DNS-записей (A, CNAME, MX, TXT, NS) доступно владельцу зоны {tld}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Network className="h-5 w-5 text-primary" />
                DNS-панель (Cloudflare DNS)
              </CardTitle>
              <CardDescription className="mt-1">
                Управление реальными DNS-записями домена{' '}
                <span className="mono font-medium text-foreground">{fqdn || `${cleanTld}.justtld.online`}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={cfConfigured ? 'success' : 'warning'} className="gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                {cfConfigured ? 'Cloudflare подключён' : 'Cloudflare не настроен (БД)'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadDns()}
                disabled={loading}
                aria-label="Обновить DNS"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfError && (
            <Alert variant="destructive">
              <AlertTitle>Предупреждение Cloudflare</AlertTitle>
              <AlertDescription>{cfError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Быстрые пресеты:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setType('A');
                setContent(serverIp);
              }}
            >
              На хостинг JustTLD (A → {serverIp})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setType('TXT');
                setContent('justtld-verified=1');
              }}
            >
              TXT верификация
            </Button>
          </div>

          <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4 md:grid-cols-6">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Цель</Label>
              <select
                value={subLabel}
                onChange={(e) => setSubLabel(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{cleanTld} (корневая зона)</option>
                {subOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}.{cleanTld}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Тип</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DnsRecordType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DNS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-3">
              <Label>Значение</Label>
              <Input
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  type === 'A'
                    ? serverIp
                    : type === 'CNAME'
                      ? 'target.example.com'
                      : type === 'MX'
                        ? 'mail.example.com'
                        : type === 'NS'
                          ? 'ns1.example.com'
                          : 'v=spf1 ~all'
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>TTL (сек)</Label>
              <Input
                type="number"
                min={60}
                max={86400}
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
              />
            </div>

            {type === 'MX' && (
              <div className="space-y-1.5">
                <Label>Приоритет MX</Label>
                <Input
                  type="number"
                  min={0}
                  max={65535}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-end md:col-span-2">
              <Button type="submit" disabled={busy || !content.trim()} className="w-full gap-1.5">
                <Plus className="h-4 w-4" />
                Добавить DNS-запись
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Управляемые DNS-записи ({records.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Пользовательских DNS-записей ещё нет. По умолчанию активен wildcard-маршрут на
              встроенный хостинг JustTLD ({serverIp}).
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((rec) => (
                <div
                  key={rec.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="mono font-semibold">
                      {rec.recordType}
                    </Badge>
                    <span className="mono font-medium">{rec.fqdn}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="mono text-foreground">{rec.content}</span>
                    {rec.priority != null && (
                      <Badge variant="secondary">MX {rec.priority}</Badge>
                    )}
                    <span className="text-muted-foreground">TTL {rec.ttl}</span>
                    <Badge variant={rec.cfRecordId ? 'success' : 'secondary'}>
                      {rec.cfRecordId ? 'Cloudflare' : 'Только БД'}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => void removeRecord(rec.id)}
                    aria-label="Удалить DNS-запись"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {cfRecords.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Текущие записи в Cloudflare для {fqdn} ({cfRecords.length}):
              </div>
              <div className="space-y-1.5">
                {cfRecords.map((cf) => (
                  <div
                    key={cf.id}
                    className="flex flex-wrap items-center gap-2 rounded bg-muted/40 px-2.5 py-1.5 text-xs"
                  >
                    <Badge variant="outline" className="mono">
                      {cf.type}
                    </Badge>
                    <span className="mono">{cf.name}</span>
                    <span>→</span>
                    <span className="mono text-muted-foreground">{cf.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
