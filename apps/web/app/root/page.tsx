'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Laptop,
  Network,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type RootZone = {
  tld: string;
  zone: string;
  ownerAddress: string;
  mode: string;
};

type RootSub = {
  tld: string;
  zone: string;
  label: string;
  fqdn: string;
  ownerAddress: string;
};

type RootSnapshot = {
  generatedAt: string;
  gatewayIp: string;
  dohUrl: string;
  rootNs: string;
  zones: RootZone[];
  subdomains: RootSub[];
};

type LookupResult = {
  source: string;
  dohUrl: string;
  name: string;
  type: string;
  status: number;
  rootActive: boolean;
  zone: string | null;
  answers: Array<{ name: string; type: string | number; TTL: number; data: string }>;
};

const DOH_URL = 'https://root.justtld.online/dns-query';

export default function RootDnsPage() {
  const [snapshot, setSnapshot] = React.useState<RootSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  const [queryName, setQueryName] = React.useState('myzone');
  const [queryType, setQueryType] = React.useState('A');
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupResult, setLookupResult] = React.useState<LookupResult | null>(null);

  const [deviceTab, setDeviceTab] = React.useState<'browser' | 'extension' | 'apple' | 'android'>(
    'browser',
  );
  const [zoneFilter, setZoneFilter] = React.useState('');

  React.useEffect(() => {
    fetch('/api/root-dns/records', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: RootSnapshot) => {
        setSnapshot(data);
        if (data.zones?.length) {
          const preferred =
            data.zones.find((z) => z.zone === 'expline') ??
            data.zones.find((z) => z.zone === 'myzone') ??
            data.zones[0];
          if (preferred) setQueryName(preferred.zone);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const copyDoh = async () => {
    try {
      await navigator.clipboard.writeText(snapshot?.dohUrl || DOH_URL);
      setCopied(true);
      toast.success('DoH-адрес скопирован');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const runLookup = async (e?: React.FormEvent, overrideName?: string) => {
    if (e) e.preventDefault();
    const target = (overrideName ?? queryName).trim().toLowerCase();
    if (!target) return;
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/root-dns/lookup?name=${encodeURIComponent(target)}&type=${encodeURIComponent(queryType)}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message || 'Ошибка DNS-запроса');
        return;
      }
      setLookupResult(data as LookupResult);
    } catch {
      toast.error('Не удалось выполнить запрос к Root DNS');
    } finally {
      setLookupLoading(false);
    }
  };

  const filteredZones = React.useMemo(() => {
    if (!snapshot?.zones) return [];
    const q = zoneFilter.trim().toLowerCase();
    if (!q) return snapshot.zones;
    return snapshot.zones.filter((z) => z.zone.includes(q) || z.tld.includes(q));
  }, [snapshot, zoneFilter]);

  return (
    <div className="container space-y-8 py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Независимый корень DNS · Без ICANN (как Handshake)
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Домены 1-го и 2-го уровня в сети JustTLD Root
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Забудьте про длинные адреса 3-го уровня. Подключите независимый DNS-корень JustTLD
              (1 клик в браузере или расширение) — и ваши сайты будут открываться напрямую как{' '}
              <span className="mono font-semibold text-foreground">http://myzone</span> (1-й уровень) и{' '}
              <span className="mono font-semibold text-foreground">http://shop.myzone</span> (2-й уровень).
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild size="sm">
                <Link href="/store">Купить свою зону 1-го уровня</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/auctions">Аукционы зон</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/icann">Реестр IANA / RDAP / WHOIS</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={copyDoh} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                Скопировать DoH
              </Button>
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            <div className="rounded-xl border bg-background/80 p-3.5">
              <div className="text-xs text-muted-foreground">Корневых зон (1 ур.)</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {loading ? '—' : snapshot?.zones.length ?? 0}
              </div>
            </div>
            <div className="rounded-xl border bg-background/80 p-3.5">
              <div className="text-xs text-muted-foreground">Поддоменов (2 ур.)</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {loading ? '—' : snapshot?.subdomains.length ?? 0}
              </div>
            </div>
            <div className="col-span-2 rounded-xl border bg-background/80 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>DoH Endpoint (RFC 8484)</span>
                <Badge variant="success" className="h-5 text-[10px]">
                  Online
                </Badge>
              </div>
              <div className="mono mt-1 truncate text-xs font-medium text-foreground">
                {snapshot?.dohUrl || DOH_URL}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Подключение */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Network className="h-5 w-5 text-primary" />
            Как открыть домены 1-го и 2-го уровня у себя (за 30 секунд)
          </CardTitle>
          <CardDescription>
            Как и в сети Handshake, обычные провайдеры знают только ICANN-домены. Выберите удобный способ —
            все обычные сайты (Google, YouTube, VK) продолжат работать как раньше, а зоны JustTLD откроются напрямую.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={deviceTab === 'browser' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceTab('browser')}
              className="gap-1.5"
            >
              <Globe className="h-4 w-4" />
              Браузер (DoH — без программ)
            </Button>
            <Button
              variant={deviceTab === 'extension' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceTab('extension')}
              className="gap-1.5"
            >
              <Laptop className="h-4 w-4" />
              Расширение Chrome / Edge
            </Button>
            <Button
              variant={deviceTab === 'apple' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceTab('apple')}
              className="gap-1.5"
            >
              <Smartphone className="h-4 w-4" />
              iPhone / iPad / Mac
            </Button>
            <Button
              variant={deviceTab === 'android' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceTab('android')}
              className="gap-1.5"
            >
              <ShieldCheck className="h-4 w-4" />
              Android / Windows
            </Button>
          </div>

          {deviceTab === 'browser' && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="font-semibold">
                Встроенный DNS через HTTPS (Chrome, Edge, Brave, Firefox, Opera, Яндекс)
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <span className="mono flex-1 truncate text-xs sm:text-sm">{DOH_URL}</span>
                <Button size="sm" variant="secondary" onClick={copyDoh} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Копировать
                </Button>
              </div>
              <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground sm:text-sm">
                <li>
                  <b>Chrome / Edge / Brave:</b> Настройки → Конфиденциальность и безопасность → Безопасность →
                  включите «Использовать безопасный DNS» → «Указать свой» → вставьте ссылку выше.
                </li>
                <li>
                  <b>Firefox:</b> Настройки → Приватность и защита → DNS через HTTPS → Максимальная защита →
                  Пользовательский → вставьте ссылку выше.
                </li>
                <li>
                  Готово! Введите в адресную строку{' '}
                  <span className="mono font-medium text-foreground">http://myzone</span> или{' '}
                  <span className="mono font-medium text-foreground">http://shop.myzone</span>.
                </li>
              </ol>
            </div>
          )}

          {deviceTab === 'extension' && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Расширение JustTLD Root Resolver (Manifest V3)</div>
                  <div className="text-xs text-muted-foreground">
                    Работает вообще без изменения DNS-настроек — перехватывает домены 1-го и 2-го уровня прямо в браузере + команда{' '}
                    <span className="mono text-foreground">tld &lt;зона&gt;</span> в адресной строке.
                  </div>
                </div>
                <Button asChild size="sm" className="gap-1.5">
                  <a href="/downloads/justtld-extension.zip" download>
                    <Download className="h-4 w-4" />
                    Скачать .zip
                  </a>
                </Button>
              </div>
              <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground sm:text-sm">
                <li>Скачайте и распакуйте архив <span className="mono">justtld-extension.zip</span> в любую папку.</li>
                <li>Откройте <span className="mono">chrome://extensions</span> (или <span className="mono">edge://extensions</span>) и включите «Режим разработчика».</li>
                <li>Нажмите «Загрузить распакованное расширение» и выберите папку.</li>
              </ol>
            </div>
          )}

          {deviceTab === 'apple' && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Профиль конфигурации для iPhone, iPad и macOS</div>
                  <div className="text-xs text-muted-foreground">
                    Подключает системный DoH на всём устройстве в 1 тап — работает в Safari и любом приложении.
                  </div>
                </div>
                <Button asChild size="sm" className="gap-1.5">
                  <a href="/api/root-dns/mobileconfig">
                    <Download className="h-4 w-4" />
                    Скачать .mobileconfig
                  </a>
                </Button>
              </div>
              <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground sm:text-sm">
                <li>Нажмите «Скачать .mobileconfig» в Safari.</li>
                <li>На iPhone откройте Настройки → «Профиль загружен» → Установить.</li>
                <li>Можно удалить в любой момент в Настройки → Основные → VPN и управление устройством.</li>
              </ol>
            </div>
          )}

          {deviceTab === 'android' && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="font-semibold">Android и Windows 11</div>
              <ol className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground sm:text-sm">
                <li>
                  <b>Android (Chrome / Firefox / Brave):</b> включите «Безопасный DNS» прямо в настройках браузера с адресом{' '}
                  <span className="mono text-foreground">{DOH_URL}</span> (или через приложение Intra / RethinkDNS для всех приложений).
                </li>
                <li>
                  <b>Windows 11:</b> Параметры → Сеть и Интернет → Параметры DNS-сервера → Изменить → Вручную → IPv4{' '}
                  <span className="mono text-foreground">95.182.89.37</span> / шаблон DoH{' '}
                  <span className="mono text-foreground">{DOH_URL}</span>.
                </li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Живой DNS-инспектор */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-primary" />
            Живая проверка Root DNS
          </CardTitle>
          <CardDescription>
            Проверьте любой адрес 1-го уровня (<span className="mono">expline</span>) или 2-го уровня (
            <span className="mono">shop.expline</span>) прямо сейчас в корневой сети JustTLD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(e) => void runLookup(e)} className="flex flex-wrap gap-2">
            <Input
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              placeholder="expline или shop.expline"
              className="min-w-[220px] flex-1"
            />
            <select
              value={queryType}
              onChange={(e) => setQueryType(e.target.value)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SOA'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={lookupLoading}>
              {lookupLoading ? 'Запрос...' : 'Проверить'}
            </Button>
          </form>

          {lookupResult && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={lookupResult.rootActive ? 'success' : 'destructive'}>
                    {lookupResult.rootActive ? 'ROOT ACTIVE (без ICANN)' : 'NXDOMAIN (зона свободна)'}
                  </Badge>
                  <span className="mono font-semibold text-foreground">{lookupResult.name}</span>
                  <Badge variant="outline">{lookupResult.type}</Badge>
                </div>
                <span className="text-muted-foreground">Источник: {lookupResult.source}</span>
              </div>

              {lookupResult.answers.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {lookupResult.answers.map((ans, idx) => (
                    <div
                      key={`${ans.name}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
                    >
                      <span className="mono font-medium">{ans.name}</span>
                      <span className="mono text-primary">{ans.data}</span>
                      <span className="text-muted-foreground">TTL {ans.TTL}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pt-1 text-muted-foreground">
                  Записей типа {lookupResult.type} не найдено.
                  {!lookupResult.rootActive && (
                    <>
                      {' '}
                      Вы можете{' '}
                      <Link href="/store" className="text-primary underline">
                        создать или купить зону .{lookupResult.name.split('.').pop()}
                      </Link>
                      !
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Реестр активных корневых зон */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-primary" />
                Активные корневые зоны JustTLD ({filteredZones.length})
              </CardTitle>
              <CardDescription>
                Любая из этих зон открывается как 1-й уровень <span className="mono">http://имя</span> при включённом
                JustTLD Root DNS (или через предпросмотр ниже).
              </CardDescription>
            </div>
            <Input
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              placeholder="Фильтр зон..."
              className="w-full sm:w-56"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Загрузка корневого реестра...</div>
          ) : filteredZones.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Зоны не найдены.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredZones.map((z) => (
                <div
                  key={z.zone}
                  className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono text-base font-bold text-foreground">http://{z.zone}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {z.mode === 'hosting' ? 'Сайт активен' : 'Зона 1 ур.'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => {
                        setQueryName(z.zone);
                        void runLookup(undefined, z.zone);
                      }}
                    >
                      DNS
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a
                        href={`/api/site-serve?zone=${encodeURIComponent(z.zone)}&root=1&path=%2F`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Предпросмотр <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <Link href={`/zone/${encodeURIComponent(z.tld)}`}>Управление</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
