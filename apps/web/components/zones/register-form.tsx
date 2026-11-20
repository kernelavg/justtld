'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeTld, validateTld, TLD_MAX_LENGTH, METADATA_MAX_LENGTH } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { useTxFlow } from '@/lib/hooks';
import { prepareRegistration, searchZones } from '@/lib/api';
import { TxStatus } from '@/components/tx/tx-status';

type Availability = {
  state: 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid';
  message: string;
};

export function RegisterForm() {
  const { t, language } = useI18n();
  const wallet = useWallet();
  const tx = useTxFlow();
  const [tld, setTld] = React.useState('');
  const [metadata, setMetadata] = React.useState('');
  const [availability, setAvailability] = React.useState<Availability>({
    state: 'idle',
    message: '',
  });

  const onTldChange = (value: string) => {
    setTld(value);
    tx.reset();
  };

  // Живая проверка доступности (локальные правила + состояние контракта).
  React.useEffect(() => {
    const candidate = normalizeTld(tld);
    if (!tld.trim()) {
      setAvailability({ state: 'idle', message: '' });
      return;
    }
    const local = validateTld(candidate);
    if (!local.ok) {
      setAvailability({
        state: 'invalid',
        message: local.message?.[language] ?? 'Некорректная зона',
      });
      return;
    }

    setAvailability({ state: 'checking', message: t('register.checking') });
    const timer = setTimeout(() => {
      searchZones(candidate)
        .then((result) => {
          if (result.availability.available) {
            setAvailability({ state: 'available', message: t('register.available') });
          } else {
            setAvailability({
              state: 'unavailable',
              message: describeReason(result.availability.reason, language),
            });
          }
        })
        .catch(() => setAvailability({ state: 'idle', message: '' }));
    }, 350);

    return () => clearTimeout(timer);
  }, [tld, language, t]);

  const canSubmit =
    Boolean(wallet.address) &&
    availability.state === 'available' &&
    tx.state.phase !== 'preparing' &&
    tx.state.phase !== 'signing' &&
    tx.state.phase !== 'pending';

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.address) {
      toast.error(t('register.connectFirst'));
      return;
    }
    const result = await tx.run(
      () =>
        prepareRegistration({
          tld: normalizeTld(tld),
          metadata,
          sender: wallet.address as string,
        }),
      { rejectedMessage: t('error.rejected') },
    );
    if (result?.status === 'confirmed') {
      toast.success(t('register.success'));
    }
  };

  const confirmedTld =
    tx.state.result?.tld ?? (tx.state.phase === 'confirmed' ? normalizeTld(tld) : null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t('register.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('register.subtitle')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tld">{t('register.label')}</Label>
              <Input
                id="tld"
                name="tld"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('register.placeholder')}
                value={tld}
                onChange={(event) => onTldChange(event.target.value)}
                className="mono text-base"
                maxLength={TLD_MAX_LENGTH + 4}
                aria-describedby="tld-availability"
              />
              <div id="tld-availability" className="min-h-5 text-sm">
                {availability.state === 'checking' && (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {availability.message}
                  </span>
                )}
                {availability.state === 'available' && (
                  <span className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {availability.message}
                  </span>
                )}
                {(availability.state === 'invalid' || availability.state === 'unavailable') && (
                  <span className="flex items-center gap-2 text-destructive">
                    <CircleAlert className="h-3.5 w-3.5" /> {availability.message}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metadata">{t('register.metadataLabel')}</Label>
              <Textarea
                id="metadata"
                name="metadata"
                value={metadata}
                onChange={(event) => setMetadata(event.target.value)}
                placeholder={t('register.metadataPlaceholder')}
                maxLength={METADATA_MAX_LENGTH}
                className="mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {metadata.length}/{METADATA_MAX_LENGTH} байт
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canSubmit} size="lg">
                {t('register.submit')}
              </Button>
              {!wallet.address && (
                <span className="text-sm text-muted-foreground">{t('register.connectFirst')}</span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{t('register.cost')}</p>
          </form>

          <div className="mt-6 space-y-3">
            <TxStatus state={tx.state} />
            {confirmedTld && (
              <Button asChild variant="outline">
                <Link href={`/zone/${confirmedTld}`}>{t('common.openZone')}</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{t('register.rules')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {(
              [
                'register.rule1',
                'register.rule2',
                'register.rule3',
                'register.rule4',
                'register.rule5',
                'register.rule6',
              ] as const
            ).map((key) => (
              <li key={key} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function describeReason(reason: string, language: 'ru' | 'en'): string {
  const map: Record<string, { ru: string; en: string }> = {
    TLD_ALREADY_EXISTS: { ru: 'Зона уже зарегистрирована', en: 'Zone is already registered' },
    TLD_RESERVED: { ru: 'Зона зарезервирована системой', en: 'Zone is reserved by the system' },
    TLD_BLACKLISTED: {
      ru: 'Название запрещено политикой реестра',
      en: 'Name is blocked by policy',
    },
    CONTRACT_PAUSED: { ru: 'Реестр на паузе', en: 'Registry is paused' },
    TLD_LENGTH: { ru: 'Неверная длина зоны (3–21 символ)', en: 'Invalid zone length (3–21)' },
    TLD_MUST_START_WITH_DOT: {
      ru: 'Зона должна начинаться с точки',
      en: 'Zone must start with a dot',
    },
    TLD_INVALID_CHARACTER: { ru: 'Недопустимый символ', en: 'Invalid character' },
    TLD_HYPHEN_EDGE: {
      ru: 'Дефис по краям запрещён',
      en: 'Leading/trailing hyphen is not allowed',
    },
    TLD_DOUBLE_HYPHEN: { ru: 'Двойной дефис запрещён', en: 'Double hyphen is not allowed' },
    TLD_EMPTY: { ru: 'Зона не может быть пустой', en: 'Zone cannot be empty' },
  };
  return map[reason]?.[language] ?? reason;
}
