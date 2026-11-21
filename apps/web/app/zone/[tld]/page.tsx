'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Globe,
  History,
  Layers,
  Network,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import {
  createCustodySubdomain,
  getSession,
  getSiteSubdomains,
  type SessionResponse,
} from '@/lib/api';
import {
  daysUntil,
  formatDate,
  formatDateTime,
  normalizeTld,
  shortenAddress,
  type ZoneCustodyDto,
  type ZoneDto,
  type ZoneEventDto,
  type Paginated,
} from '@justtld/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ZoneStatusBadge } from '@/components/zones/status-badge';
import { ZoneActions } from '@/components/zones/zone-actions';
import { ZoneSubdomains } from '@/components/zones/subdomains';
import { useExplorerUrl } from '@/components/tx/tx-status';
import { parseZoneMetadata } from '@/lib/metadata';
import { CopyUrlButton, ResolverLinksCard } from '@/components/zones/resolver-links';
import { SiteManager } from '@/components/sites/site-manager';
import { DnsManager } from '@/components/sites/dns-manager';
import { EmailAuthCard } from '@/components/auth/email-auth-card';

type ZoneResponse = {
  zone: ZoneDto | null;
  chain: {
    owner: string;
    registeredAt: number;
    expiresAt: number;
    updatedAt: number;
    blocked: boolean;
    metadata: string;
  } | null;
  consistent: boolean;
  subdomainsCount?: number;
  subdomainsEnabled?: boolean;
  subdomainsContract?: string | null;
  gracePeriodDays?: number;
  graceEndsAt?: string | null;
  transfers: Array<{
    id: string;
    fromAddress: string;
    toAddress: string;
    status: string;
    createdAt: string;
  }>;
};

export default function ZonePage() {
  const params = useParams<{ tld: string }>();
  const searchParams = useSearchParams();
  const rawTld = decodeURIComponent(params?.tld ?? '');
  const tld = normalizeTld(rawTld);
  const { t, language } = useI18n();
  const wallet = useWallet();
  const txUrl = useExplorerUrl();

  const initialTab = searchParams.get('tab');
  const [tab, setTab] = React.useState<'overview' | 'site' | 'dns' | 'subdomains' | 'history'>(
    initialTab === 'site' ||
      initialTab === 'dns' ||
      initialTab === 'subdomains' ||
      initialTab === 'history'
      ? initialTab
      : 'overview',
  );
  const [showRawMeta, setShowRawMeta] = React.useState(false);
  const [sessionState, setSessionState] = React.useState<SessionResponse | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = React.useState(false);
  const [custodySubs, setCustodySubs] = React.useState<ZoneCustodyDto[]>([]);
  const [newSubLabel, setNewSubLabel] = React.useState('');
  const [creatingSub, setCreatingSub] = React.useState(false);

  const zone = useApiData<ZoneResponse>(`/api/zones/${encodeURIComponent(tld)}`, [tld]);
  const history = useApiData<Paginated<ZoneEventDto> & { tld: string }>(
    `/api/zones/${encodeURIComponent(tld)}/history?limit=20`,
    [tld],
  );

  const loadExtra = React.useCallback(() => {
    getSession()
      .then(setSessionState)
      .catch(() => setSessionState(null));
    getSiteSubdomains(tld)
      .then((res) => setCustodySubs(res.custody))
      .catch(() => setCustodySubs([]));
  }, [tld]);

  React.useEffect(() => {
    loadExtra();
  }, [loadExtra]);

  const reload = () => {
    zone.reload();
    history.reload();
    loadExtra();
  };

  if (zone.loading) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (zone.error || (!zone.data?.zone && !zone.data?.chain)) {
    return (
      <div className="container py-16">
        <Card className="mx-auto max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{t('common.notFound')}</h1>
            <p className="text-sm text-muted-foreground">
              {zone.error ?? `${tld} не зарегистрирована`}
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/zones">
                  <ArrowLeft className="h-4 w-4" /> {t('nav.zones')}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/register?tld=${encodeURIComponent(tld)}`}>{t('nav.register')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cached = zone.data?.zone ?? null;
  const chain = zone.data?.chain ?? null;
  const view = cached ?? {
    id: '',
    tld,
    ownerAddress: chain?.owner ?? '',
    status: chain?.blocked ? 'blocked' : 'active',
    registeredAt: new Date((chain?.registeredAt ?? 0) * 1000).toISOString(),
    expiresAt: new Date((chain?.expiresAt ?? 0) * 1000).toISOString(),
    metadata: chain?.metadata ?? '',
    transactionHash: '',
    blockNumber: 0,
    createdAt: '',
    updatedAt: '',
  };

  const activeAddress = wallet.address ?? sessionState?.session?.address ?? null;
  const isAdmin = sessionState?.session?.role === 'admin';
  const isOwner =
    Boolean(activeAddress) && activeAddress?.toLowerCase() === view.ownerAddress.toLowerCase();
  const canManageHost = isOwner || isAdmin;
  const hasSession = Boolean(sessionState?.session);

  const handleCreateCustodySub = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSubLabel.trim().toLowerCase();
    if (!cleaned) return;
    setCreatingSub(true);
    try {
      await createCustodySubdomain({ tld, label: cleaned, withStarterSite: true });
      setNewSubLabel('');
      toast.success(`Поддомен ${cleaned}${tld} создан со стартовым сайтом`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать поддомен');
    } finally {
      setCreatingSub(false);
    }
  };

  const regMs = new Date(view.registeredAt).getTime();
  const expMs = new Date(view.expiresAt).getTime();
  const nowMs = Date.now();
  const totalLifeMs = Math.max(1, expMs - regMs);
  const elapsedPct = Math.min(100, Math.max(0, ((nowMs - regMs) / totalLifeMs) * 100));
  const remainingDays = daysUntil(view.expiresAt);
  const graceDays = zone.data?.gracePeriodDays ?? 30;
  const graceEndsAt =
    zone.data?.graceEndsAt ?? new Date(expMs + graceDays * 86_400_000).toISOString();
  const inGrace = nowMs >= expMs && nowMs < new Date(graceEndsAt).getTime();
  const maxSubExpiresAt = new Date(Math.min(nowMs + 365 * 86_400_000, expMs)).toISOString();

  const parsedMeta = parseZoneMetadata(view.metadata);
  const subdomainsCount = zone.data?.subdomainsCount ?? 0;

  const ownerMatch =
    Boolean(cached && chain) && cached!.ownerAddress.toLowerCase() === chain!.owner.toLowerCase();
  const expiresMatch =
    Boolean(cached && chain) &&
    Math.abs(new Date(cached!.expiresAt).getTime() / 1000 - chain!.expiresAt) < 2;
  const blockedMatch =
    Boolean(cached && chain) && (cached!.status === 'blocked') === chain!.blocked;
  const metaMatch = Boolean(cached && chain) && cached!.metadata === chain!.metadata;

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/zones"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t('nav.zones')}
        </Link>
        <Button size="sm" variant="ghost" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" /> Обновить данные
        </Button>
      </div>

      {/* Шапка зоны */}
      <div className="mt-4 rounded-2xl border bg-card/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="mono text-3xl font-bold tracking-tight md:text-4xl">{view.tld}</h1>
              <ZoneStatusBadge status={view.status} />
              {isOwner ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Вы владелец зоны
                </Badge>
              ) : null}
              {!zone.data?.consistent ? (
                <Badge variant="warning">
                  <AlertTriangle className="mr-1 h-3 w-3" /> кэш догоняет сеть
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Владелец:{' '}
                <Link
                  href={`/address/${view.ownerAddress}`}
                  className="mono font-medium text-foreground hover:text-primary"
                >
                  {shortenAddress(view.ownerAddress, 6)}
                </Link>
              </span>
              <span>·</span>
              <span>
                Поддоменов: <strong className="text-foreground">{subdomainsCount}</strong>
              </span>
              <span>·</span>
              <span>
                {view.status === 'active'
                  ? `Осталось ${remainingDays} дн. (до ${formatDate(view.expiresAt, language)})`
                  : inGrace
                    ? `Grace-период до ${formatDate(graceEndsAt, language)}`
                    : `Истекла ${formatDate(view.expiresAt, language)}`}
              </span>
            </div>
          </div>

          <ZoneActions zone={view as ZoneDto} onChanged={reload} />
        </div>
      </div>

      {view.status === 'blocked' && (
        <Alert variant="destructive" className="mt-4">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t('common.blocked')}</AlertTitle>
          <AlertDescription>{t('zone.blockedBanner')}</AlertDescription>
        </Alert>
      )}

      {view.status === 'expired' && (
        <Alert variant="warning" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {inGrace ? 'Зона в льготном периоде (Grace period)' : t('common.expired')}
          </AlertTitle>
          <AlertDescription>
            {inGrace
              ? `Срок истёк, но до ${formatDateTime(graceEndsAt, language)} продлить зону может только прежний владелец. После этой даты её сможет занять любой адрес.`
              : t('zone.expiredBanner')}
          </AlertDescription>
        </Alert>
      )}

      {!zone.data?.consistent && (
        <Alert variant="warning" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('zone.inconsistent')}</AlertTitle>
          <AlertDescription>
            {t('zone.cachedNote')} — {t('zone.chainState')}:{' '}
            {chain ? shortenAddress(chain.owner, 6) : '—'}
          </AlertDescription>
        </Alert>
      )}

      {/* Вкладки */}
      <Tabs
        value={tab}
        onValueChange={(next) =>
          setTab(next as 'overview' | 'site' | 'dns' | 'subdomains' | 'history')
        }
        className="mt-6"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview">Обзор и данные</TabsTrigger>
          <TabsTrigger value="site" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Сайт и файлы
          </TabsTrigger>
          <TabsTrigger value="dns" className="gap-1.5">
            <Network className="h-3.5 w-3.5" /> DNS
          </TabsTrigger>
          <TabsTrigger value="subdomains" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Поддомены
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {subdomainsCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> История и блокчейн
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {history.data?.total ?? 0}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* 1. ОБЗОР И ТОЧНЫЕ ДАННЫЕ ВЛАДЕЛЬЦА */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            {/* Сроки и права владельца */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-primary" /> Сроки владения и параметры
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Прогресс-бар срока жизни */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Прошло срока: {Math.round(elapsedPct)}%
                    </span>
                    <span className="font-medium tabular-nums">
                      {view.status === 'active'
                        ? `Осталось ${remainingDays} дн.`
                        : inGrace
                          ? `Льготный период до ${formatDate(graceEndsAt, language)}`
                          : 'Срок завершён'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        remainingDays <= 30 ? 'bg-warning' : 'bg-primary'
                      }`}
                      style={{ width: `${elapsedPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('zone.owner')}>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/address/${view.ownerAddress}`}
                        className="mono text-xs hover:text-primary"
                      >
                        {view.ownerAddress}
                      </Link>
                      <CopyUrlButton url={view.ownerAddress} />
                    </div>
                  </Field>
                  <Field label={t('zone.status')}>
                    <ZoneStatusBadge status={view.status} />
                  </Field>
                  <Field label={t('zone.registeredAt')}>
                    <span className="text-sm">{formatDateTime(view.registeredAt, language)}</span>
                  </Field>
                  <Field label={t('zone.expiresAt')}>
                    <span className="text-sm">{formatDateTime(view.expiresAt, language)}</span>
                  </Field>
                  <Field label={`Grace-период (+${graceDays} дн.)`}>
                    <span className="text-sm">{formatDateTime(graceEndsAt, language)}</span>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      До этой даты перехват зоны другим адресом закрыт
                    </p>
                  </Field>
                  <Field label="Макс. срок новых поддоменов">
                    <span className="text-sm">{formatDateTime(maxSubExpiresAt, language)}</span>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Ограничен min(сегодня + 365 дн., срок зоны)
                    </p>
                  </Field>
                  <Field label={t('common.transaction')}>
                    {view.transactionHash ? (
                      <Link
                        href={txUrl(view.transactionHash)}
                        className="mono inline-flex items-center gap-1 text-sm hover:text-primary"
                      >
                        {shortenAddress(view.transactionHash, 8)}{' '}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      '—'
                    )}
                  </Field>
                  <Field label={t('common.block')}>
                    <span className="mono text-sm tabular-nums">{view.blockNumber || '—'}</span>
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* Резолвер и быстрый доступ к поддоменам */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Резолвер и публичные ссылки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResolverLinksCard tld={view.tld} />
                  <p className="text-[11px] text-muted-foreground">
                    Если в метаданных указан <code className="mono">url</code>, эти ссылки сразу
                    перенаправляют на ваш сайт; иначе открывается карточка зоны.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Поддомены внутри зоны</CardTitle>
                  <Badge variant="outline">{subdomainsCount}</Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {isOwner
                      ? 'Вы можете выпускать поддомены (blog, docs, shop) с отдельным сроком, ссылкой и владельцем.'
                      : `Поддомены в ${view.tld} регистрирует только владелец зоны.`}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setTab('subdomains')}
                  >
                    <Layers className="h-4 w-4" /> Открыть вкладку поддоменов ({subdomainsCount})
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Разобранные метаданные */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Назначение и метаданные</CardTitle>
              {view.metadata ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setShowRawMeta((v) => !v)}
                >
                  {showRawMeta ? 'Показать карточкой' : 'Показать сырой JSON'}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {!view.metadata ? (
                <p className="text-sm text-muted-foreground">{t('zone.metadataEmpty')}</p>
              ) : showRawMeta ||
                (!parsedMeta.url && !parsedMeta.title && !parsedMeta.description) ? (
                <pre className="mono max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                  {view.metadata}
                </pre>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Целевой URL (редирект)">
                    {parsedMeta.url ? (
                      <a
                        href={parsedMeta.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mono inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {parsedMeta.url} <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">Не задан</span>
                    )}
                  </Field>
                  <Field label="Заголовок">
                    <span className="text-sm">{parsedMeta.title ?? '—'}</span>
                  </Field>
                  <Field label="Описание">
                    <span className="text-sm">{parsedMeta.description ?? '—'}</span>
                  </Field>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 1.5. САЙТ И ФАЙЛЫ */}
        <TabsContent value="site">
          <SiteManager
            tld={view.tld}
            isOwner={canManageHost}
            hasSession={hasSession}
            onRequireAuth={() => setAuthDialogOpen(true)}
          />
        </TabsContent>

        {/* 1.6. DNS */}
        <TabsContent value="dns">
          <DnsManager
            tld={view.tld}
            isOwner={canManageHost}
            hasSession={hasSession}
            onRequireAuth={() => setAuthDialogOpen(true)}
          />
        </TabsContent>

        {/* 2. ПОДДОМЕНЫ */}
        <TabsContent value="subdomains" className="space-y-4">
          {canManageHost && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Создать поддомен платформы (без газа и MetaMask)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={handleCreateCustodySub} className="flex flex-wrap gap-2">
                  <div className="flex flex-1 items-center gap-1 min-w-[220px]">
                    <Input
                      value={newSubLabel}
                      onChange={(e) => setNewSubLabel(e.target.value)}
                      placeholder="blog"
                      className="mono"
                    />
                    <span className="mono text-sm text-muted-foreground">{view.tld}</span>
                  </div>
                  <Button type="submit" disabled={creatingSub || !newSubLabel.trim()} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Создать поддомен и сайт
                  </Button>
                </form>

                {custodySubs.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Поддомены платформы ({custodySubs.length}):
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {custodySubs.map((cs) => (
                        <div
                          key={cs.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                        >
                          <span className="mono font-semibold">
                            {cs.subLabel}
                            {cs.tld}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTab('site')}
                          >
                            Открыть файлы сайта
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {chain ? <ZoneSubdomains zone={view as ZoneDto} onChanged={reload} /> : null}
        </TabsContent>

        {/* 3. ИСТОРИЯ И БЛОКЧЕЙН */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сверка: блокчейн ↔ кэш индексатора</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {chain ? (
                <div className="divide-y rounded-lg border">
                  <CompareRow
                    label="Владелец"
                    ok={ownerMatch}
                    chainValue={chain.owner}
                    cacheValue={cached?.ownerAddress ?? 'нет в кэше'}
                  />
                  <CompareRow
                    label="Срок истечения"
                    ok={expiresMatch}
                    chainValue={formatDateTime(chain.expiresAt, language)}
                    cacheValue={cached ? formatDateTime(cached.expiresAt, language) : 'нет в кэше'}
                  />
                  <CompareRow
                    label="Блокировка"
                    ok={blockedMatch}
                    chainValue={chain.blocked ? 'заблокирована' : 'нет'}
                    cacheValue={
                      cached ? (cached.status === 'blocked' ? 'заблокирована' : 'нет') : '—'
                    }
                  />
                  <CompareRow
                    label="Метаданные"
                    ok={metaMatch}
                    chainValue={chain.metadata || '—'}
                    cacheValue={cached ? cached.metadata || '—' : '—'}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Зона отсутствует в контракте</p>
              )}
              {zone.data?.subdomainsContract ? (
                <p className="mono text-[11px] text-muted-foreground">
                  Контракт поддоменов: {zone.data.subdomainsContract}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> {t('zone.history')}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{history.data?.total ?? 0}</span>
            </CardHeader>
            <CardContent>
              {history.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : history.data && history.data.items.length > 0 ? (
                <ol className="space-y-3">
                  {history.data.items.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{event.eventType}</Badge>
                        <Link
                          href={`/address/${event.actorAddress}`}
                          className="mono text-xs text-muted-foreground hover:text-primary"
                        >
                          {shortenAddress(event.actorAddress, 5)}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>#{event.blockNumber}</span>
                        <Link
                          href={txUrl(event.transactionHash)}
                          className="mono hover:text-primary"
                        >
                          {shortenAddress(event.transactionHash, 6)}
                        </Link>
                        <span>{formatDateTime(event.createdAt, language)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t('zone.historyEmpty')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Авторизация для управления зоной {view.tld}</DialogTitle>
            <DialogDescription>
              Войдите через Email и пароль (или подтвердите подписью кошелёк в кабинете).
            </DialogDescription>
          </DialogHeader>
          <EmailAuthCard
            onSuccess={() => {
              setAuthDialogOpen(false);
              reload();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-all">{children}</div>
    </div>
  );
}

function CompareRow({
  label,
  ok,
  chainValue,
  cacheValue,
}: {
  label: string;
  ok: boolean;
  chainValue: string;
  cacheValue: string;
}) {
  return (
    <div className="grid items-center gap-2 px-3 py-2.5 text-xs sm:grid-cols-[130px_1fr_1fr_auto]">
      <span className="font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <span className="text-[10px] uppercase text-muted-foreground">Контракт: </span>
        <span className="mono break-all">{chainValue}</span>
      </div>
      <div className="min-w-0">
        <span className="text-[10px] uppercase text-muted-foreground">Индексатор: </span>
        <span className="mono break-all">{cacheValue}</span>
      </div>
      <span className="justify-self-end">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-warning" />
        )}
      </span>
    </div>
  );
}
