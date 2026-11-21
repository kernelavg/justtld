'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Database,
  Download,
  FileCode2,
  Network,
  Search,
  Server,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type RdapResult = {
  errorCode?: number;
  title?: string;
  available?: boolean;
  ldhName?: string;
  handle?: string;
  status?: string[];
  events?: Array<{ eventAction: string; eventDate: string }>;
  nameservers?: Array<{ ldhName: string }>;
  entities?: Array<{ handle: string; roles: string[] }>;
  justtld?: {
    level: number;
    tld: string;
    zone: string;
    subLabel: string;
    source: string;
    siteMode: string;
  };
};

export default function IcannAuthorityPage() {
  const [rootZoneText, setRootZoneText] = React.useState('');
  const [zoneLoading, setZoneLoading] = React.useState(true);

  const [rdapQuery, setRdapQuery] = React.useState('justtld-demo');
  const [rdapLoading, setRdapLoading] = React.useState(false);
  const [rdapResult, setRdapResult] = React.useState<RdapResult | null>(null);

  const loadRootZone = React.useCallback(() => {
    setZoneLoading(true);
    fetch('/api/icann/root.zone', { cache: 'no-store' })
      .then((r) => r.text())
      .then((txt) => setRootZoneText(txt))
      .catch(() => toast.error('Не удалось загрузить файл root.zone'))
      .finally(() => setZoneLoading(false));
  }, []);

  React.useEffect(() => {
    loadRootZone();
  }, [loadRootZone]);

  const runRdap = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = rdapQuery.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!clean) return;
    setRdapLoading(true);
    try {
      const res = await fetch(`/api/rdap/domain/${encodeURIComponent(clean)}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as RdapResult;
      setRdapResult(data);
    } catch {
      toast.error('Ошибка запроса RDAP');
    } finally {
      setRdapLoading(false);
    }
  };

  return (
    <div className="container space-y-8 py-8">
      {/* Header */}
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Shield className="h-3.5 w-3.5" />
              JustTLD Root Authority · Независимая архитектура уровня IANA / ICANN
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Собственная система реестра корня, RDAP и WHOIS
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Полный стек независимой системы доменных имён по стандартам IETF/ICANN: свой корень{' '}
              <span className="mono text-foreground">(.)</span>, файл зоны{' '}
              <span className="mono text-foreground">root.zone</span>, NS-делегирование TLD, протокол{' '}
              <span className="mono text-foreground">RDAP (RFC 7483)</span>, TCP{' '}
              <span className="mono text-foreground">WHOIS :43</span> и публичный DoH-резолвер.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm">
                <Link href="/root">Подключить у себя (DoH / Расширение)</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/api/icann/root.zone" target="_blank" rel="noreferrer">
                  <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
                  Открыть root.zone
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/api/icann/root.hints" download="named.root">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Скачать root.hints
                </a>
              </Button>
            </div>
          </div>

          <div className="grid w-full max-w-sm gap-2.5 text-xs">
            <div className="rounded-xl border bg-background/80 p-3.5">
              <div className="text-muted-foreground">Authoritative Root Servers</div>
              <div className="mono mt-1 font-semibold">a.root.justtld.online (95.182.89.37)</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-3.5">
              <div className="text-muted-foreground">WHOIS Server (TCP :43)</div>
              <div className="mono mt-1 font-semibold">whois -h 95.182.89.37 &lt;domain&gt;</div>
            </div>
            <div className="rounded-xl border bg-background/80 p-3.5">
              <div className="text-muted-foreground">RDAP Endpoint (RFC 7483)</div>
              <div className="mono mt-1 truncate font-semibold">/api/rdap/domain/&lt;name&gt;</div>
            </div>
          </div>
        </div>
      </section>

      {/* RDAP / WHOIS поиск */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-primary" />
            RDAP &amp; WHOIS Реестр (1-й и 2-й уровень)
          </CardTitle>
          <CardDescription>
            Стандартный запрос к базе регистратора/реестра — работает по тем же спецификациям, что и у ICANN RDAP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={runRdap} className="flex flex-wrap gap-2">
            <Input
              value={rdapQuery}
              onChange={(e) => setRdapQuery(e.target.value)}
              placeholder="justtld-demo, myzone или blog.justtld-demo"
              className="min-w-[240px] flex-1"
            />
            <Button type="submit" disabled={rdapLoading}>
              {rdapLoading ? 'Поиск...' : 'Запрос RDAP'}
            </Button>
          </form>

          {rdapResult && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-xs">
              {rdapResult.errorCode ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="mr-2">
                      {rdapResult.errorCode}
                    </Badge>
                    <span className="font-medium">{rdapResult.title}</span> — имя{' '}
                    <span className="mono">{rdapResult.ldhName}</span> свободно.
                  </div>
                  <Button asChild size="sm">
                    <Link href="/store">Зарегистрировать</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">{rdapResult.status?.[0] ?? 'active'}</Badge>
                      <span className="mono text-sm font-bold">{rdapResult.ldhName}</span>
                      <Badge variant="outline">{rdapResult.justtld?.level} уровень</Badge>
                    </div>
                    <div className="text-muted-foreground">Handle: {rdapResult.handle}</div>
                    {rdapResult.entities?.map((ent) => (
                      <div key={`${ent.roles[0]}-${ent.handle}`} className="mono">
                        {ent.roles.join(', ')}: {ent.handle}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <div className="font-semibold text-foreground">Name Servers (делегирование):</div>
                    {rdapResult.nameservers?.map((ns) => (
                      <div key={ns.ldhName} className="mono text-primary">
                        NS → {ns.ldhName}
                      </div>
                    ))}
                    {rdapResult.events?.map((ev) => (
                      <div key={ev.eventAction} className="text-muted-foreground">
                        {ev.eventAction}: <span className="mono text-foreground">{ev.eventDate}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Master Root Zone File */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />
                Файл корневой зоны (Master Root Zone — RFC 1035)
              </CardTitle>
              <CardDescription>
                Живой файл корневой зоны <span className="mono">.</span> со всеми делегированными TLD, SOA-серийником
                и NS/Glue-записями (как <span className="mono">internic.net/domain/root.zone</span>).
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadRootZone} disabled={zoneLoading}>
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="mono max-h-[420px] overflow-auto rounded-xl border bg-zinc-950 p-4 text-[11px] leading-relaxed text-zinc-200">
            {zoneLoading ? 'Загрузка root.zone...' : rootZoneText}
          </pre>
        </CardContent>
      </Card>

      {/* Инструкция для DNS-операторов и провайдеров */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-primary" />
            Подключение для операторов, серверов и провайдеров (Unbound / BIND9)
          </CardTitle>
          <CardDescription>
            Любой администратор сервера или локальной сети может подключить наш корень напрямую через{' '}
            <span className="mono">root.hints</span> или форвардинг DoH / UDP.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-xs">
          <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Network className="h-4 w-4 text-primary" />
              Unbound (named.root / forward-zone)
            </div>
            <pre className="mono overflow-auto rounded-lg bg-zinc-950 p-3 text-zinc-200">{`server:
  root-hints: "/etc/unbound/justtld-root.hints"
# Скачать: https://justtld.online/api/icann/root.hints`}</pre>
          </div>
          <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              WHOIS &amp; RDAP в терминале
            </div>
            <pre className="mono overflow-auto rounded-lg bg-zinc-950 p-3 text-zinc-200">{`whois -h 95.182.89.37 myzone
whois -h whois.justtld.online blog.justtld-demo
curl https://justtld.online/api/rdap/domain/myzone`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
