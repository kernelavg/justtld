'use client';

import * as React from 'react';
import { PenLine, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { isAddress } from 'viem';
import { METADATA_MAX_LENGTH } from '@justtld/shared';
import type { ZoneDto } from '@justtld/shared';
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
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { useTxFlow } from '@/lib/hooks';
import { prepareMetadata, prepareRenewal, prepareTransfer } from '@/lib/api';
import { TxStatus } from '@/components/tx/tx-status';

type ActionKind = 'transfer' | 'renew' | 'metadata' | null;

export function ZoneActions({
  zone,
  onChanged,
  compact = false,
}: {
  zone: ZoneDto;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const wallet = useWallet();
  const transfer = useTxFlow();
  const renew = useTxFlow();
  const metadata = useTxFlow();

  const [action, setAction] = React.useState<ActionKind>(null);
  const [recipient, setRecipient] = React.useState('');
  const [metadataValue, setMetadataValue] = React.useState(zone.metadata);

  const isOwner = Boolean(wallet.address) && wallet.address?.toLowerCase() === zone.ownerAddress;
  const size = compact ? 'sm' : 'default';

  const close = () => {
    setAction(null);
    setRecipient('');
    transfer.reset();
    renew.reset();
    metadata.reset();
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address) return;
    if (!isAddress(recipient)) {
      toast.error('Некорректный адрес получателя');
      return;
    }
    const result = await transfer.run(
      () => prepareTransfer({ tld: zone.tld, to: recipient, sender: wallet.address as string }),
      { rejectedMessage: t('error.rejected') },
    );
    if (result?.status === 'confirmed') {
      toast.success('Зона передана новому владельцу');
      onChanged?.();
      close();
    }
  };

  const submitRenew = async () => {
    if (!wallet.address) return;
    const result = await renew.run(
      () => prepareRenewal({ tld: zone.tld, sender: wallet.address as string }),
      { rejectedMessage: t('error.rejected') },
    );
    if (result?.status === 'confirmed') {
      toast.success('Зона продлена на 365 дней');
      onChanged?.();
      close();
    }
  };

  const submitMetadata = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address) return;
    const result = await metadata.run(
      () =>
        prepareMetadata({
          tld: zone.tld,
          metadata: metadataValue,
          sender: wallet.address as string,
        }),
      { rejectedMessage: t('error.rejected') },
    );
    if (result?.status === 'confirmed') {
      toast.success('Метаданные обновлены');
      onChanged?.();
      close();
    }
  };

  if (!isOwner) {
    return (
      <p className="text-xs text-muted-foreground">
        {wallet.address ? t('zone.notOwnerHint') : t('register.connectFirst')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="outline" onClick={() => setAction('renew')}>
        <RefreshCw className="h-4 w-4" /> {t('zone.renew')}
      </Button>
      <Button size={size} variant="outline" onClick={() => setAction('transfer')}>
        <Send className="h-4 w-4" /> {t('zone.transfer')}
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={() => {
          setMetadataValue(zone.metadata);
          setAction('metadata');
        }}
      >
        <PenLine className="h-4 w-4" /> {t('zone.editMetadata')}
      </Button>

      {/* Продление */}
      <Dialog open={action === 'renew'} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('zone.renewTitle')} {zone.tld}
            </DialogTitle>
            <DialogDescription>{t('zone.renewDesc')}</DialogDescription>
          </DialogHeader>
          <TxStatus state={renew.state} />
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submitRenew}
              disabled={renew.state.phase === 'pending' || renew.state.phase === 'signing'}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Передача */}
      <Dialog open={action === 'transfer'} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('zone.transferTitle')} {zone.tld}
            </DialogTitle>
            <DialogDescription>{t('zone.transferDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">{t('zone.recipient')}</Label>
              <Input
                id="recipient"
                className="mono text-xs"
                placeholder="0x…"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
              />
            </div>
            <TxStatus state={transfer.state} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={transfer.state.phase === 'pending' || transfer.state.phase === 'signing'}
              >
                {t('zone.transfer')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Метаданные */}
      <Dialog open={action === 'metadata'} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('zone.metadataTitle')}</DialogTitle>
            <DialogDescription>{t('zone.metadataDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitMetadata} className="space-y-4">
            <Textarea
              className="mono text-xs"
              value={metadataValue}
              maxLength={METADATA_MAX_LENGTH}
              onChange={(event) => setMetadataValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {metadataValue.length}/{METADATA_MAX_LENGTH}
            </p>
            <TxStatus state={metadata.state} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={metadata.state.phase === 'pending' || metadata.state.phase === 'signing'}
              >
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
