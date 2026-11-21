'use client';

import * as React from 'react';
import {
  Ban,
  Database,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { shortenAddress, formatDateTime, type Paginated } from '@justtld/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { useApiData, useTxFlow } from '@/lib/hooks';
import {
  adminBlacklist,
  adminBlockZone,
  adminPause,
  adminReserved,
  adminResync,
  adminUnblockZone,
  adminUnpause,
  getAdminLists,
  getSession,
  signInWithWallet,
} from '@/lib/api';
import { AdminStorePanel } from '@/components/admin/admin-store-panel';

type AuditPage = Paginated<{
  id: string;
  actorAddress: string;
  action: string;
  target: string | null;
  transactionHash: string | null;
  ip: string | null;
  outcome: string;
  createdAt: string;
}>;

export default function AdminPage() {
  const { t, language } = useI18n();
  const wallet = useWallet();
  const [session, setSession] = React.useState<{ address: string; role: 'admin' | 'user' } | null>(
    null,
  );
  const [checking, setChecking] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const [zoneInput, setZoneInput] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [word, setWord] = React.useState('');
  const [reservedTld, setReservedTld] = React.useState('');

  const txFlow = useTxFlow();

  const lists = useApiData<Awaited<ReturnType<typeof getAdminLists>>>(
    session ? '/api/admin/lists' : null,
    [session, refreshTick],
  );
  const audit = useApiData<AuditPage>(session ? '/api/admin/audit?page=1&limit=20' : null, [
    session,
    refreshTick,
  ]);

  React.useEffect(() => {
    getSession()
      .then((result) => setSession(result.session))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  const refresh = () => {
    setRefreshTick((value) => value + 1);
    lists.reload();
    audit.reload();
  };

  const signIn = async () => {
    if (!wallet.address) return;
    setBusy(true);
    try {
      const user = await signInWithWallet(wallet.address, wallet.signMessage);
      setSession(user);
      toast.success(t('dashboard.signedIn'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const runPrepared = async (
    prepare: () => Promise<{ tx: import('@justtld/shared').UnsignedTx; intentId?: string }>,
    successMessage: string,
  ) => {
    const result = await txFlow.run(prepare, { rejectedMessage: t('error.rejected') });
    if (result?.status === 'confirmed') {
      toast.success(successMessage);
      refresh();
    } else if (txFlow.state.error) {
      toast.error(txFlow.state.error);
    }
  };

  if (checking) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container py-16">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" /> {t('admin.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('admin.loginRequired')}</p>
            {wallet.address ? (
              <Button onClick={signIn} disabled={busy}>
                <KeyRound className="h-4 w-4" /> {t('dashboard.signIn')}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t('register.connectFirst')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (session.role !== 'admin') {
    return (
      <div className="container py-16">
        <Card className="mx-auto max-w-lg border-destructive/40">
          <CardContent className="space-y-2 p-6">
            <h1 className="text-lg font-semibold text-destructive">{t('admin.notAdmin')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('admin.subtitle')} · {t('admin.contractOwner')}:{' '}
              {shortenAddress(lists.data?.contractOwner ?? '', 6)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const blockZone = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = zoneInput.trim();
    const normalized = target.startsWith('.') ? target.toLowerCase() : `.${target.toLowerCase()}`;
    if (!reason.trim()) {
      toast.error(t('admin.reason'));
      return;
    }
    await runPrepared(
      () => adminBlockZone(normalized, reason.trim()),
      `Зона ${normalized} заблокирована`,
    );
    setZoneInput('');
    setReason('');
  };

  const unblockZone = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = zoneInput.trim();
    const normalized = target.startsWith('.') ? target.toLowerCase() : `.${target.toLowerCase()}`;
    await runPrepared(() => adminUnblockZone(normalized), `Зона ${normalized} разблокирована`);
    setZoneInput('');
  };

  return (
    <div className="container py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="mono">
            {shortenAddress(session.address, 6)}
          </Badge>
          <Badge variant={lists.data?.paused ? 'destructive' : 'success'}>
            {lists.data?.paused ? t('admin.paused') : t('admin.notPaused')}
          </Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('admin.contractOwner')}</div>
            <div className="mono mt-1 text-xs">{lists.data?.contractOwner ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('admin.lastIndexed')}</div>
            <div className="text-lg font-semibold">
              {lists.data?.indexer.lastIndexedBlock ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('admin.blacklist')}</div>
            <div className="text-lg font-semibold">{lists.data?.blacklist.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('admin.reserved')}</div>
            <div className="text-lg font-semibold">{lists.data?.reserved.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="store">
          <TabsList>
            <TabsTrigger value="store">Магазин и оплата</TabsTrigger>
            <TabsTrigger value="zones">{t('common.zones')}</TabsTrigger>
            <TabsTrigger value="lists">{t('admin.blacklist')}</TabsTrigger>
            <TabsTrigger value="system">{t('admin.indexer')}</TabsTrigger>
            <TabsTrigger value="audit">{t('admin.audit')}</TabsTrigger>
          </TabsList>

          <TabsContent value="store">
            <AdminStorePanel />
          </TabsContent>

          <TabsContent value="zones">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Ban className="h-4 w-4 text-destructive" /> {t('admin.blockZone')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={blockZone} className="space-y-3">
                    <Input
                      className="mono"
                      placeholder=".myzone"
                      value={zoneInput}
                      onChange={(event) => setZoneInput(event.target.value)}
                    />
                    <Input
                      placeholder={t('admin.reasonPlaceholder')}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={256}
                    />
                    <Button type="submit" variant="destructive" disabled={busy}>
                      {t('admin.blockZone')}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PlayCircle className="h-4 w-4 text-success" /> {t('admin.unblockZone')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={unblockZone} className="space-y-3">
                    <Input
                      className="mono"
                      placeholder=".myzone"
                      value={zoneInput}
                      onChange={(event) => setZoneInput(event.target.value)}
                    />
                    <Button type="submit" variant="success" disabled={busy}>
                      {t('admin.unblockZone')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lists">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('admin.blacklist')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      className="mono"
                      placeholder="scam"
                      value={word}
                      onChange={(event) => setWord(event.target.value)}
                    />
                    <Button
                      onClick={async () => {
                        const value = word.trim().toLowerCase();
                        if (value.length < 2) return;
                        await runPrepared(
                          () => adminBlacklist(value, 'add'),
                          `Слово "${value}" добавлено в чёрный список`,
                        );
                        setWord('');
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {(lists.data?.blacklist ?? []).map((item) => (
                      <li
                        key={item}
                        className="flex items-center justify-between rounded border px-2 py-1"
                      >
                        <span className="mono text-xs">{item}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            runPrepared(
                              () => adminBlacklist(item, 'remove'),
                              `Слово "${item}" удалено`,
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                    {(lists.data?.blacklist ?? []).length === 0 && (
                      <li className="text-xs text-muted-foreground">{t('common.empty')}</li>
                    )}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('admin.reserved')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      className="mono"
                      placeholder=".justtld"
                      value={reservedTld}
                      onChange={(event) => setReservedTld(event.target.value)}
                    />
                    <Button
                      onClick={async () => {
                        const value = reservedTld.trim().toLowerCase();
                        if (!value.startsWith('.')) return;
                        await runPrepared(
                          () => adminReserved(value, 'add'),
                          `Зона ${value} зарезервирована`,
                        );
                        setReservedTld('');
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {(lists.data?.reserved ?? []).map((item) => (
                      <li
                        key={item}
                        className="flex items-center justify-between rounded border px-2 py-1"
                      >
                        <span className="mono text-xs">{item}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            runPrepared(
                              () => adminReserved(item, 'remove'),
                              `Зона ${item} разрезервирована`,
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                    {(lists.data?.reserved ?? []).length === 0 && (
                      <li className="text-xs text-muted-foreground">{t('common.empty')}</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="system">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('admin.indexer')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('admin.lastIndexed')}</div>
                    <div className="font-semibold">
                      {lists.data?.indexer.lastIndexedBlock ?? '—'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(lists.data?.indexer.updatedAt, language)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{t('admin.paused')}</div>
                    <div className="font-semibold">
                      {lists.data?.paused ? t('admin.paused') : t('admin.notPaused')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      runPrepared(
                        () =>
                          adminPause().then((result) => ({
                            tx: result.tx as import('@justtld/shared').UnsignedTx,
                          })),
                        t('admin.paused'),
                      )
                    }
                  >
                    <PauseCircle className="h-4 w-4" /> {t('admin.pause')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      runPrepared(
                        () =>
                          adminUnpause().then((result) => ({
                            tx: result.tx as import('@justtld/shared').UnsignedTx,
                          })),
                        t('admin.notPaused'),
                      )
                    }
                  >
                    <PlayCircle className="h-4 w-4" /> {t('admin.unpause')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await adminResync(true);
                        toast.success('Команда resync поставлена в очередь индексатора');
                        refresh();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : t('error.unknown'));
                      }
                    }}
                  >
                    <Database className="h-4 w-4" /> {t('admin.resync')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('admin.resyncHint')}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('admin.audit')}</CardTitle>
              </CardHeader>
              <CardContent>
                {audit.loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : audit.data && audit.data.items.length > 0 ? (
                  <div className="divide-y text-sm">
                    {audit.data.items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={entry.outcome === 'success' ? 'secondary' : 'destructive'}
                          >
                            {entry.action}
                          </Badge>
                          <span className="mono text-xs">{entry.target ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="mono">{shortenAddress(entry.actorAddress, 4)}</span>
                          <span>{entry.ip ?? '—'}</span>
                          <span>{formatDateTime(entry.createdAt, language)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('admin.auditEmpty')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {txFlow.state.phase !== 'idle' && (
        <Alert
          variant={
            txFlow.state.phase === 'confirmed'
              ? 'success'
              : txFlow.state.phase === 'failed'
                ? 'destructive'
                : 'default'
          }
          className="mt-6"
        >
          <AlertTitle>
            {txFlow.state.phase === 'confirmed'
              ? t('tx.confirmedTitle')
              : txFlow.state.phase === 'failed'
                ? t('tx.failedTitle')
                : t('tx.pendingTitle')}
          </AlertTitle>
          <AlertDescription>
            <span className="mono text-xs">
              {txFlow.state.hash ?? txFlow.state.error ?? txFlow.state.phase}
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
