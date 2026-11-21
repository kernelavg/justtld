'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Clock,
  Layers,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import {
  daysUntil,
  formatDate,
  METADATA_MAX_LENGTH,
  shortenAddress,
  type Paginated,
  type SubdomainDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
} from '@/components/ui/primitives';
import { useWallet } from '@/lib/wallet';
import { useApiData, useTxFlow } from '@/lib/hooks';
import {
  prepareSubdomainMetadata,
  prepareSubdomainRegistration,
  prepareSubdomainRenewal,
  prepareSubdomainTransfer,
} from '@/lib/api';
import { TxStatus } from '@/components/tx/tx-status';
import { buildResolverLinks, parseZoneMetadata } from '@/lib/metadata';
import {
  CopyUrlButton,
  ResolverLinksCard,
  useResolverDomain,
} from '@/components/zones/resolver-links';
import { MetadataEditor } from '@/components/zones/metadata-editor';
import { validateSubdomainLabelInput } from '@/components/zones/subdomains';

type SubdomainsResponse = Paginated<SubdomainDto> & {
  enabled: boolean;
  contract: string | null;
};

const STATUS_FILTERS = ['all', 'active', 'expired', 'blocked'] as const;
type SubdomainSort = 'newest' | 'oldest' | 'name' | 'expires_soon';

export default function SubdomainsPage() {
  const wallet = useWallet();
  const resolverDomain = useResolverDomain();

  const [tab, setTab] = React.useState<'all' | 'mine' | 'myZones'>('all');
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>('all');
  const [sort, setSort] = React.useState<SubdomainSort>('newest');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);

  const query = React.useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '18', status, sort });
    if (q.trim()) params.set('q', q.trim());
    if (tab !== 'all' && wallet.address) {
      params.set('owner', wallet.address);
      params.set('scope', tab === 'mine' ? 'owner' : 'zone_owner');
    }
    return params.toString();
  }, [page, status, sort, q, tab, wallet.address]);

  const list = useApiData<SubdomainsResponse>(`/api/subdomains?${query}`, [query]);
  const myZones = useApiData<Paginated<ZoneDto>>(
    wallet.address ? `/api/zones?owner=${wallet.address}&status=active&limit=100` : null,
    [wallet.address],
  );

  const create = useTxFlow();
  const renew = useTxFlow();
  const transfer = useTxFlow();
  const metadata = useTxFlow();

  const [dialog, setDialog] = React.useState<'create' | 'transfer' | 'metadata' | null>(null);
  const [selectedZoneTld, setSelectedZoneTld] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [metadataValue, setMetadataValue] = React.useState('');
  const [recipient, setRecipient] = React.useState('');
  const [selectedSub, setSelectedSub] = React.useState<SubdomainDto | null>(null);

  const activeZones = React.useMemo(() => myZones.data?.items ?? [], [myZones.data]);
  React.useEffect(() => {
    if (!selectedZoneTld && activeZones[0]?.tld) {
      setSelectedZoneTld(activeZones[0].tld);
    }
  }, [activeZones, selectedZoneTld]);

  const selectedZone = activeZones.find((z) => z.tld === selectedZoneTld) ?? null;
  const normalizedLabel = label.trim().toLowerCase();
  const labelError = validateSubdomainLabelInput(label);
  const metaBytes = new TextEncoder().encode(metadataValue).length;

  const close = () => {
    setDialog(null);
    setLabel('');
    setMetadataValue('');
    setRecipient('');
    setSelectedSub(null);
    create.reset();
    renew.reset();
    transfer.reset();
    metadata.reset();
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address || !selectedZone || !normalizedLabel || labelError) return;
    const result = await create.run(
      () =>
        prepareSubdomainRegistration({
          tld: selectedZone.tld,
          label: normalizedLabel,
          metadata: metadataValue,
          sender: wallet.address as string,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${normalizedLabel}${selectedZone.tld} создан`);
      list.reload();
      close();
    }
  };

  const submitRenew = async (sub: SubdomainDto) => {
    if (!wallet.address) return;
    const result = await renew.run(
      () =>
        prepareSubdomainRenewal({
          tld: sub.tld,
          label: sub.label,
          sender: wallet.address as string,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${sub.name} продлён`);
      list.reload();
    }
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address || !selectedSub) return;
    if (!isAddress(recipient)) {
      toast.error('Некорректный адрес получателя');
      return;
    }
    const result = await transfer.run(
      () =>
        prepareSubdomainTransfer({
          tld: selectedSub.tld,
          label: selectedSub.label,
          to: recipient,
          sender: wallet.address as string,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${selectedSub.name} передан`);
      list.reload();
      close();
    }
  };

  const submitMetadata = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address || !selectedSub || metaBytes > METADATA_MAX_LENGTH) return;
    const result = await metadata.run(
      () =>
        prepareSubdomainMetadata({
          tld: selectedSub.tld,
          label: selectedSub.label,
          metadata: metadataValue,
          sender: wallet.address as string,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success('Метаданные поддомена обновлены');
      list.reload();
      close();
    }
  };

  const items = list.data?.items ?? [];

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" /> Отдельный реестр второго уровня
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Поддомены</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Имена вида <code className="mono">blog.justtld-demo</code> внутри зарегистрированных
            зон. У каждого поддомена свой владелец, метаданные и рабочие ссылки в резолвере.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => list.reload()}>
            <RefreshCw className="h-4 w-4" /> Обновить
          </Button>
          {wallet.address && activeZones.length > 0 ? (
            <Button onClick={() => setDialog('create')}>
              <Plus className="h-4 w-4" /> Создать поддомен
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/register">
                <Sparkles className="h-4 w-4" /> Зарегистрировать зону
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Сводка и переключатель области */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('all');
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Все поддомены
          </button>
          <button
            type="button"
            disabled={!wallet.address}
            onClick={() => {
              setTab('mine');
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-45 ${
              tab === 'mine' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Мои (владелец)
          </button>
          <button
            type="button"
            disabled={!wallet.address}
            onClick={() => {
              setTab('myZones');
              setPage(1);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-45 ${
              tab === 'myZones'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            В моих зонах
          </button>
        </div>

        {list.data ? (
          <div className="text-xs text-muted-foreground">
            Найдено: <span className="font-semibold text-foreground">{list.data.total}</span>
            {list.data.contract ? (
              <span className="mono ml-2 hidden sm:inline">
                · контракт {shortenAddress(list.data.contract, 6)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Поиск и фильтры */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Поиск по имени (blog.justtld-demo) или адресу владельца 0x…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'default' : 'outline'}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {value === 'all'
                ? 'Все'
                : value === 'active'
                  ? 'Активные'
                  : value === 'expired'
                    ? 'Истекли'
                    : 'Заблокированы'}
            </Button>
          ))}
        </div>

        <select
          aria-label="Сортировка поддоменов"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SubdomainSort);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="name">По алфавиту</option>
          <option value="expires_soon">Скоро истекают</option>
        </select>
      </div>

      {renew.state && renew.state.phase !== 'idle' ? (
        <div className="mt-4">
          <TxStatus state={renew.state} />
        </div>
      ) : null}

      {/* Список */}
      <div className="mt-6">
        {list.loading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : list.error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-destructive">
              {list.error}
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {tab !== 'all' && !wallet.address
                  ? 'Подключите кошелёк, чтобы увидеть свои поддомены.'
                  : 'Поддоменов по заданному фильтру пока нет.'}
              </p>
              {wallet.address && activeZones.length > 0 ? (
                <Button size="sm" onClick={() => setDialog('create')}>
                  <Plus className="h-4 w-4" /> Создать поддомен
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((sub) => {
              const viewer = wallet.address?.toLowerCase() ?? '';
              const isSubOwner = Boolean(viewer) && viewer === sub.ownerAddress.toLowerCase();
              const isZoneOwner = Boolean(viewer) && viewer === sub.zoneOwnerAddress.toLowerCase();
              const canManage = isSubOwner || isZoneOwner;
              const days = daysUntil(sub.expiresAt);
              const parsed = parseZoneMetadata(sub.metadata);
              const links = buildResolverLinks({
                tld: sub.tld,
                label: sub.label,
                baseDomain: resolverDomain,
              });
              const primaryUrl = links[0]?.url ?? '';

              return (
                <Card
                  key={sub.id}
                  className="flex flex-col justify-between transition-colors hover:border-primary/50"
                >
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mono truncate text-lg font-semibold">{sub.name}</span>
                        </div>
                        <Link
                          href={`/zone/${sub.tld}`}
                          className="mono text-xs text-muted-foreground hover:text-primary"
                        >
                          зона {sub.tld} →
                        </Link>
                      </div>
                      <Badge
                        variant={
                          sub.status === 'active'
                            ? 'success'
                            : sub.status === 'expired'
                              ? 'warning'
                              : 'destructive'
                        }
                      >
                        {sub.status === 'active'
                          ? 'Активен'
                          : sub.status === 'expired'
                            ? 'Истёк'
                            : 'Блок'}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Владелец</span>
                        <Link
                          href={`/address/${sub.ownerAddress}`}
                          className="mono text-foreground hover:text-primary"
                        >
                          {shortenAddress(sub.ownerAddress, 5)}
                        </Link>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Срок</span>
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatDate(sub.expiresAt, 'ru')} ({days} дн.)
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                      {parsed.url ? (
                        <a
                          href={parsed.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mono block truncate font-medium text-primary hover:underline"
                        >
                          → {parsed.url}
                        </a>
                      ) : sub.metadata ? (
                        <p className="mono truncate text-muted-foreground">{sub.metadata}</p>
                      ) : (
                        <p className="text-muted-foreground">Без редиректа (карточка резолвера)</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1">
                        {primaryUrl ? (
                          <>
                            <CopyUrlButton url={primaryUrl} label="URL" />
                            <Button asChild size="sm" variant="outline" className="h-8">
                              <a href={primaryUrl} target="_blank" rel="noreferrer">
                                Открыть <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {canManage && sub.status === 'active' ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            title="Продлить"
                            onClick={() => submitRenew(sub)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            title="Метаданные"
                            onClick={() => {
                              setSelectedSub(sub);
                              setMetadataValue(sub.metadata);
                              setDialog('metadata');
                            }}
                          >
                            <PenLine className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            title="Передать"
                            onClick={() => {
                              setSelectedSub(sub);
                              setDialog('transfer');
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {list.data && list.data.pages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {list.data.pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= list.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </Button>
        </div>
      ) : null}

      {/* Создание поддомена с выбором своей зоны */}
      <Dialog open={dialog === 'create'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-w-xl">
          <form onSubmit={submitCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Создать поддомен</DialogTitle>
              <DialogDescription>
                Выберите одну из ваших активных зон и задайте метку. Срок действия не превысит срок
                выбранной зоны.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr]">
              <div className="space-y-1.5">
                <Label htmlFor="pick-zone">Зона</Label>
                <select
                  id="pick-zone"
                  value={selectedZoneTld}
                  onChange={(event) => setSelectedZoneTld(event.target.value)}
                  className="mono h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {activeZones.map((z) => (
                    <option key={z.id} value={z.tld}>
                      {z.tld} (до {formatDate(z.expiresAt, 'ru')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pick-label">Метка</Label>
                <Input
                  id="pick-label"
                  className="mono"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="blog"
                  required
                />
              </div>
            </div>

            {labelError ? <p className="text-xs text-destructive">{labelError}</p> : null}

            {selectedZone && normalizedLabel && !labelError ? (
              <ResolverLinksCard tld={selectedZone.tld} label={normalizedLabel} compact />
            ) : null}

            <div className="space-y-1.5">
              <Label>Метаданные и редирект</Label>
              <MetadataEditor
                value={metadataValue}
                onChange={setMetadataValue}
                idPrefix="cat-sub"
              />
            </div>

            {create.state && create.state.phase !== 'idle' ? (
              <TxStatus state={create.state} />
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={
                  !selectedZone ||
                  !normalizedLabel ||
                  Boolean(labelError) ||
                  metaBytes > METADATA_MAX_LENGTH
                }
              >
                Создать за gas
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Передача */}
      <Dialog open={dialog === 'transfer'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <form onSubmit={submitTransfer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Передать {selectedSub?.name}</DialogTitle>
              <DialogDescription>Укажите EVM-адрес нового владельца поддомена.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="cat-to">Адрес получателя</Label>
              <Input
                id="cat-to"
                className="mono"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x..."
                required
              />
            </div>
            {transfer.state && transfer.state.phase !== 'idle' ? (
              <TxStatus state={transfer.state} />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Отмена
              </Button>
              <Button type="submit">Передать</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Метаданные */}
      <Dialog open={dialog === 'metadata'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-w-xl">
          <form onSubmit={submitMetadata} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Метаданные {selectedSub?.name}</DialogTitle>
            </DialogHeader>
            <MetadataEditor
              value={metadataValue}
              onChange={setMetadataValue}
              idPrefix="cat-meta-edit"
            />
            {metadata.state && metadata.state.phase !== 'idle' ? (
              <TxStatus state={metadata.state} />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Отмена
              </Button>
              <Button type="submit" disabled={metaBytes > METADATA_MAX_LENGTH}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
