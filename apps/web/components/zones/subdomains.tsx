'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Clock, PenLine, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import {
  daysUntil,
  formatDate,
  formatDateTime,
  METADATA_MAX_LENGTH,
  shortenAddress,
  type SubdomainDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type SubdomainList = { items: SubdomainDto[]; total: number };

export function validateSubdomainLabelInput(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.length > 32) return 'Максимум 32 символа';
  if (!/^[a-z0-9-]+$/.test(value)) return 'Только латиница a-z, цифры 0-9 и дефис';
  if (value.startsWith('-') || value.endsWith('-'))
    return 'Дефис не может быть в начале или в конце';
  if (value.includes('--')) return 'Двойной дефис «--» запрещён (он зарезервирован для резолвера)';
  return null;
}

/**
 * Поддомены зоны: список из индексера + действия владельца зоны/поддомена.
 * Поддомен живёт в отдельном контракте JustTLDSubdomains (см. docs/SUBDOMAINS.md).
 */
export function ZoneSubdomains({ zone, onChanged }: { zone: ZoneDto; onChanged?: () => void }) {
  const wallet = useWallet();
  const resolverDomain = useResolverDomain();
  const list = useApiData<SubdomainList>(
    `/api/zones/${encodeURIComponent(zone.tld)}/subdomains?limit=100`,
    [zone.tld],
  );

  const create = useTxFlow();
  const renew = useTxFlow();
  const transfer = useTxFlow();
  const metadata = useTxFlow();

  const [dialog, setDialog] = React.useState<'create' | 'transfer' | 'metadata' | null>(null);
  const [label, setLabel] = React.useState('');
  const [metadataValue, setMetadataValue] = React.useState('');
  const [recipient, setRecipient] = React.useState('');
  const [selected, setSelected] = React.useState<SubdomainDto | null>(null);

  const isZoneOwner =
    Boolean(wallet.address) && wallet.address?.toLowerCase() === zone.ownerAddress.toLowerCase();
  const address = wallet.address as string | undefined;
  const normalizedLabel = label.trim().toLowerCase();
  const labelError = validateSubdomainLabelInput(label);
  const metaBytes = new TextEncoder().encode(metadataValue).length;

  const zoneExpiresMs = new Date(zone.expiresAt).getTime();
  const maxSubExpiresIso = new Date(
    Math.min(Date.now() + 365 * 86_400_000, zoneExpiresMs),
  ).toISOString();

  const close = () => {
    setDialog(null);
    setLabel('');
    setMetadataValue('');
    setRecipient('');
    setSelected(null);
    create.reset();
    renew.reset();
    transfer.reset();
    metadata.reset();
  };

  const reload = () => {
    list.reload();
    onChanged?.();
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !normalizedLabel || labelError || metaBytes > METADATA_MAX_LENGTH) return;
    const result = await create.run(
      () =>
        prepareSubdomainRegistration({
          tld: zone.tld,
          label: normalizedLabel,
          metadata: metadataValue,
          sender: address,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${normalizedLabel}${zone.tld} создан`);
      reload();
      close();
    }
  };

  const submitRenew = async (sub: SubdomainDto) => {
    if (!address) return;
    const result = await renew.run(
      () => prepareSubdomainRenewal({ tld: zone.tld, label: sub.label, sender: address }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${sub.name} продлён`);
      reload();
    }
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !selected) return;
    if (!isAddress(recipient)) {
      toast.error('Некорректный адрес получателя');
      return;
    }
    const result = await transfer.run(
      () =>
        prepareSubdomainTransfer({
          tld: zone.tld,
          label: selected.label,
          to: recipient,
          sender: address,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${selected.name} передан`);
      reload();
      close();
    }
  };

  const submitMetadata = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address || !selected || metaBytes > METADATA_MAX_LENGTH) return;
    const result = await metadata.run(
      () =>
        prepareSubdomainMetadata({
          tld: zone.tld,
          label: selected.label,
          metadata: metadataValue,
          sender: address,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success('Метаданные поддомена обновлены');
      reload();
      close();
    }
  };

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const canCreate = isZoneOwner && zone.status === 'active';

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Поддомены зоны {zone.tld}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {total === 0
              ? 'Внутри зоны пока нет поддоменов'
              : `Всего поддоменов: ${total} · каждый со своим владельцем, сроком и адресом резолвера`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => list.reload()} title="Обновить список">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canCreate ? (
            <Button size="sm" onClick={() => setDialog('create')}>
              <Plus className="h-4 w-4" /> Создать поддомен
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isZoneOwner && zone.status !== 'active' ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Зона неактивна — чтобы создавать новые поддомены, сначала продлите её.</span>
          </div>
        ) : null}

        {list.error ? (
          <p className="text-sm text-destructive">{list.error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {isZoneOwner
                ? 'Создайте первый поддомен — например blog, api или shop. Его можно привязать к URL или передать другому кошельку.'
                : `Поддомены в ${zone.tld} создаёт только владелец зоны.`}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((sub) => {
              const isSubOwner =
                Boolean(wallet.address) &&
                wallet.address?.toLowerCase() === sub.ownerAddress.toLowerCase();
              const canManage = isSubOwner || isZoneOwner;
              const days = daysUntil(sub.expiresAt);
              const parsed = parseZoneMetadata(sub.metadata);
              const links = buildResolverLinks({
                tld: zone.tld,
                label: sub.label,
                baseDomain: resolverDomain,
              });
              const primaryUrl = links[0]?.url ?? '';
              const atZoneCeiling =
                new Date(zone.expiresAt).getTime() - new Date(sub.expiresAt).getTime() < 86_400_000;

              return (
                <div
                  key={sub.id}
                  className="rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-base font-semibold">{sub.name}</span>
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
                            ? 'активен'
                            : sub.status === 'expired'
                              ? 'истёк'
                              : 'заблокирован'}
                        </Badge>
                        {isSubOwner ? <Badge variant="outline">ваш</Badge> : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Владелец:{' '}
                          <Link
                            href={`/address/${sub.ownerAddress}`}
                            className="mono text-foreground hover:text-primary"
                          >
                            {shortenAddress(sub.ownerAddress, 5)}
                          </Link>
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          до {formatDateTime(sub.expiresAt, 'ru')} ({days} дн.)
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
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
                      {canManage && sub.status === 'active' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={atZoneCeiling}
                            title={
                              atZoneCeiling
                                ? 'Срок поддомена уже совпадает со сроком зоны — сначала продлите зону'
                                : 'Продлить поддомен (не дольше срока зоны)'
                            }
                            onClick={() => submitRenew(sub)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Продлить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              setSelected(sub);
                              setMetadataValue(sub.metadata);
                              setDialog('metadata');
                            }}
                          >
                            <PenLine className="h-3.5 w-3.5" /> Метаданные
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            title="Передать поддомен"
                            onClick={() => {
                              setSelected(sub);
                              setDialog('transfer');
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      {parsed.url ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">Редирект:</span>
                          <a
                            href={parsed.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mono truncate font-medium text-primary hover:underline"
                          >
                            {parsed.url}
                          </a>
                          {parsed.title ? (
                            <span className="text-muted-foreground">· {parsed.title}</span>
                          ) : null}
                        </div>
                      ) : sub.metadata ? (
                        <span className="mono block truncate text-muted-foreground">
                          {sub.metadata}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Метаданные не заданы — резолвер покажет карточку поддомена
                        </span>
                      )}
                    </div>
                    <span className="mono hidden text-[11px] text-muted-foreground md:inline">
                      {links[1]?.url.replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {renew.state && renew.state.phase !== 'idle' ? <TxStatus state={renew.state} /> : null}
      </CardContent>

      {/* Создание поддомена */}
      <Dialog open={dialog === 'create'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-w-xl">
          <form onSubmit={submitCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Новый поддомен в {zone.tld}</DialogTitle>
              <DialogDescription>
                Срок действия: до 365 дней, но не дольше зоны (максимум до{' '}
                {formatDate(maxSubExpiresIso, 'ru')}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="sub-label">Метка поддомена</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sub-label"
                  className="mono"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="blog"
                  required
                />
                <span className="mono text-sm text-muted-foreground">{zone.tld}</span>
              </div>
              {labelError ? (
                <p className="text-xs text-destructive">{labelError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  1–32 символа: a-z, 0-9, дефис (не по краям и без «--»).
                </p>
              )}
            </div>

            {normalizedLabel && !labelError ? (
              <ResolverLinksCard tld={zone.tld} label={normalizedLabel} compact />
            ) : null}

            <div className="space-y-1.5">
              <Label>Назначение и метаданные</Label>
              <MetadataEditor
                value={metadataValue}
                onChange={setMetadataValue}
                idPrefix="sub-create"
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
                  !normalizedLabel ||
                  Boolean(labelError) ||
                  metaBytes > METADATA_MAX_LENGTH ||
                  create.state?.phase === 'preparing' ||
                  create.state?.phase === 'signing' ||
                  create.state?.phase === 'pending'
                }
              >
                Создать за gas
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Передача поддомена */}
      <Dialog open={dialog === 'transfer'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <form onSubmit={submitTransfer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Передать {selected?.name}</DialogTitle>
              <DialogDescription>
                Новый владелец сможет продлевать поддомен и менять его метаданные. Владелец зоны{' '}
                {zone.tld} при этом сохраняет право управления.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="sub-to">Адрес получателя</Label>
              <Input
                id="sub-to"
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

      {/* Метаданные поддомена */}
      <Dialog open={dialog === 'metadata'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-w-xl">
          <form onSubmit={submitMetadata} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Метаданные {selected?.name}</DialogTitle>
              <DialogDescription>
                Укажите ссылку для редиректа в резолвере или произвольный JSON до{' '}
                {METADATA_MAX_LENGTH} байт.
              </DialogDescription>
            </DialogHeader>
            <MetadataEditor value={metadataValue} onChange={setMetadataValue} idPrefix="sub-edit" />
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
    </Card>
  );
}
