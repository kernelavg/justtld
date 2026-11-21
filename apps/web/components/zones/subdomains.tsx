'use client';

import * as React from 'react';
import { Plus, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import {
  formatDateTime,
  METADATA_MAX_LENGTH,
  type SubdomainDto,
  type ZoneDto,
} from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
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

type SubdomainList = { items: SubdomainDto[]; total: number };

/**
 * Поддомены зоны: список из индексера + действия владельца зоны/поддомена.
 * Поддомен живёт в отдельном контракте JustTLDSubdomains (см. docs/SUBDOMAINS.md).
 */
export function ZoneSubdomains({ zone, onChanged }: { zone: ZoneDto; onChanged?: () => void }) {
  const wallet = useWallet();
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
    Boolean(wallet.address) && wallet.address?.toLowerCase() === zone.ownerAddress;
  const address = wallet.address as string | undefined;

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
    if (!address) return;
    const result = await create.run(
      () =>
        prepareSubdomainRegistration({
          tld: zone.tld,
          label: label.trim().toLowerCase(),
          metadata: metadataValue,
          sender: address,
        }),
      { rejectedMessage: 'Транзакция отклонена в кошельке' },
    );
    if (result?.status === 'confirmed') {
      toast.success(`Поддомен ${label.trim().toLowerCase()}${zone.tld} создан`);
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
    if (!address || !selected) return;
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Поддомены</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {total === 0
              ? 'Внутри зоны пока нет поддоменов'
              : `Всего поддоменов: ${total} · каждый со своим владельцем и сроком`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => list.reload()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {isZoneOwner ? (
            <Button size="sm" onClick={() => setDialog('create')}>
              <Plus className="h-4 w-4" /> Создать
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.error ? (
          <p className="text-sm text-destructive">{list.error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isZoneOwner
              ? 'Создайте первый поддомен — например blog или shop. Он получит собственного владельца, срок и метаданные.'
              : `Поддомены в ${zone.tld} создаёт только владелец зоны.`}
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((sub) => {
              const isOwner =
                Boolean(wallet.address) &&
                (wallet.address?.toLowerCase() === sub.ownerAddress || isZoneOwner);
              return (
                <li key={sub.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="mono text-sm">{sub.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.ownerAddress.slice(0, 6)}…{sub.ownerAddress.slice(-4)} · до{' '}
                      {formatDateTime(new Date(sub.expiresAt), 'ru')}
                    </p>
                  </div>
                  <Badge variant={sub.status === 'active' ? 'success' : 'secondary'}>
                    {sub.status === 'active'
                      ? 'активен'
                      : sub.status === 'expired'
                        ? 'истёк'
                        : 'заблокирован'}
                  </Badge>
                  {isOwner && sub.status === 'active' ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => submitRenew(sub)}>
                        Продлить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(sub);
                          setMetadataValue(sub.metadata);
                          setDialog('metadata');
                        }}
                      >
                        Метаданные
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(sub);
                          setDialog('transfer');
                        }}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {renew.state ? <TxStatus state={renew.state} /> : null}
      </CardContent>

      <Dialog open={dialog === 'create'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <form onSubmit={submitCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Новый поддомен в {zone.tld}</DialogTitle>
              <DialogDescription>
                Метка — 1–32 символа: латиница, цифры, дефис. Срок поддомена не может быть больше
                срока зоны (до {formatDateTime(new Date(zone.expiresAt), 'ru')}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="sub-label">Метка</Label>
              <Input
                id="sub-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="blog"
                required
              />
              <p className="mono text-xs text-muted-foreground">
                {label.trim().toLowerCase() || 'blog'}
                {zone.tld}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-metadata">Метаданные (JSON, необязательно)</Label>
              <Textarea
                id="sub-metadata"
                value={metadataValue}
                onChange={(event) => setMetadataValue(event.target.value)}
                placeholder='{"url":"https://example.com"}'
                maxLength={METADATA_MAX_LENGTH}
                rows={3}
              />
            </div>
            <TxStatus state={create.state} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button type="submit" disabled={create.state?.phase === 'pending'}>
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'transfer'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <form onSubmit={submitTransfer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Передать {selected?.name}</DialogTitle>
              <DialogDescription>
                Поддомен перейдёт новому адресу. Владелец зоны сохраняет права администратора.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="sub-to">Адрес получателя</Label>
              <Input
                id="sub-to"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x…"
                required
              />
            </div>
            <TxStatus state={transfer.state} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button type="submit" disabled={transfer.state?.phase === 'pending'}>
                Передать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'metadata'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent>
          <form onSubmit={submitMetadata} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Метаданные {selected?.name}</DialogTitle>
              <DialogDescription>
                JSON до {METADATA_MAX_LENGTH} байт. Поле url/site/redirect превратит поддомен в
                редирект.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={metadataValue}
              onChange={(event) => setMetadataValue(event.target.value)}
              maxLength={METADATA_MAX_LENGTH}
              rows={4}
            />
            <TxStatus state={metadata.state} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button type="submit" disabled={metadata.state?.phase === 'pending'}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
