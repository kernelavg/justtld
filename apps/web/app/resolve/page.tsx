import { redirect } from 'next/navigation';
import { getSubdomainByName, getZoneByTld, refreshExpiredStatuses } from '@justtld/db';
import { formatDateTime, normalizeTld, shortenAddress, validateTldFormat } from '@justtld/shared';

export const dynamic = 'force-dynamic';

/**
 * Резолвер имён: сюда middleware переписывает запросы вида `myzone.вашдомен`.
 *
 * Что показывает:
 *  - если в метаданных зоны есть `url` / `site` / `redirect` — редирект на этот адрес;
 *  - иначе — карточку зоны (владелец, срок, ссылки), чтобы имя было полезным и без сайта;
 *  - если имя свободно или истекло — страницу с предложением зарегистрировать его.
 */
export default async function ResolvePage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string; via?: string; label?: string }>;
}) {
  const { zone: raw, via, label: rawLabel } = await searchParams;
  // via=path — имя открыто по пути (site/myzone), а не по поддомену: подсказываем разницу.
  const pathMode = via === 'path';
  const label = decodeURIComponent(raw ?? '').trim();
  // В режиме пути (без своего домена) поясняем, как это же имя будет выглядеть с доменом.
  const pathHint = pathMode
    ? `Имя открыто по пути: /${label}. Когда задан RESOLVER_DOMAIN, этот же адрес станет ${label}.вашдомен — см. docs/DEPLOY-PAAS.md §3.`
    : undefined;
  const tld = normalizeTld(label);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://justtld.onrender.com').replace(
    /\/+$/,
    '',
  );

  // Двухуровневый резолвер: blog.femboy.<домен> или /femboy/blog.
  const subLabel = decodeURIComponent(rawLabel ?? '')
    .trim()
    .toLowerCase();
  if (subLabel) {
    return resolveSubdomain({ tld, subLabel, pathMode, appUrl });
  }

  if (!label) {
    return (
      <Shell title="Резолвер JustTLD" hint={pathHint}>
        <p className="text-muted-foreground">
          Этот домен обслуживает зоны JustTLD. Откройте <code>имя.домен</code> или вернитесь на{' '}
          <a className="underline" href={appUrl}>
            главную
          </a>
          .
        </p>
      </Shell>
    );
  }

  const format = validateTldFormat(tld);
  let zone = null;
  let dbError: string | null = null;
  if (format.ok) {
    try {
      await refreshExpiredStatuses().catch(() => 0);
      zone = await getZoneByTld(tld);
    } catch (error) {
      dbError = (error as Error).message;
    }
  }

  if (dbError) {
    return (
      <Shell title={tld}>
        <p className="text-destructive">Не удалось прочитать реестр: {dbError}</p>
      </Shell>
    );
  }

  if (!format.ok) {
    return (
      <Shell title={label}>
        <p className="text-destructive">{format.message?.ru ?? format.code}</p>
        <p className="text-muted-foreground">
          Такой адрес не может быть зоной. Имя должно состоять из латиницы, цифр и дефиса.
        </p>
      </Shell>
    );
  }

  if (!zone || zone.status !== 'active') {
    const expired = zone?.status === 'expired';
    return (
      <Shell title={tld} hint={pathHint}>
        <p className="text-lg font-medium">{expired ? 'Срок этой зоны истёк' : 'Зона свободна'}</p>
        <p className="text-muted-foreground">
          {expired
            ? 'Прежний владелец не продлил имя. По правилам контракта его может занять любой адрес.'
            : 'Это имя ещё никто не занял. Оно может стать вашим на 365 дней.'}
        </p>
        <a
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          href={`${appUrl}/register?zone=${encodeURIComponent(tld)}`}
        >
          Зарегистрировать {tld}
        </a>
      </Shell>
    );
  }

  // Если владелец указал сайт в метаданных — уводим туда.
  const target = redirectTarget(zone.metadata);
  if (target) redirect(target);

  const metadata = prettyMetadata(zone.metadata);
  return (
    <Shell title={tld} hint={pathHint}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">активна</span>
        <span className="text-muted-foreground">
          до {formatDateTime(new Date(zone.expiresAt), 'ru')}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Владелец</dt>
          <dd className="mono break-all text-sm">
            <a
              className="underline decoration-dotted hover:text-foreground"
              href={explorerUrl('address', zone.ownerAddress)}
            >
              {zone.ownerAddress}
            </a>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Зарегистрирована
          </dt>
          <dd className="text-sm">{formatDateTime(new Date(zone.registeredAt), 'ru')}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Транзакция</dt>
          <dd className="mono truncate text-sm">
            <a
              className="underline decoration-dotted hover:text-foreground"
              href={explorerUrl('tx', zone.transactionHash)}
            >
              {shortenAddress(zone.transactionHash)}
            </a>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Блок</dt>
          <dd className="text-sm">{zone.blockNumber}</dd>
        </div>
      </dl>

      {metadata ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Метаданные</p>
          <pre className="mono mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {metadata}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Владелец не указал адрес сайта в метаданных. Добавить его можно из{' '}
          <a className="underline" href={`${appUrl}/zone/${encodeURIComponent(tld)}`}>
            страницы зоны
          </a>
          .
        </p>
      )}

      <a className="text-sm underline" href={`${appUrl}/zone/${encodeURIComponent(tld)}`}>
        Подробнее о зоне →
      </a>
    </Shell>
  );
}

/**
 * Карточка поддомена: `blog.femboy.justtld.online` или `/femboy/blog`.
 * Поддомен живёт в отдельном контракте, поэтому читаем кэш индексатора,
 * а если записи в кэше нет — честно показываем, что имя свободно.
 */
async function resolveSubdomain(params: {
  tld: string;
  subLabel: string;
  pathMode: boolean;
  appUrl: string;
}) {
  const { tld, subLabel, pathMode, appUrl } = params;
  const name = `${subLabel}.${tld.replace(/^\./, '')}`;
  const hint = pathMode
    ? `Имя открыто по пути: /${tld.replace(/^\./, '')}/${subLabel}. С доменом этот же адрес станет ${name}.вашдомен.`
    : undefined;

  if (!/^[a-z0-9-]{1,32}$/.test(subLabel)) {
    return (
      <Shell title={name} hint={hint}>
        <p className="text-destructive">Некорректная метка поддомена</p>
        <p className="text-muted-foreground">
          Метка — от 1 до 32 символов: латиница, цифры и дефис, без дефиса по краям.
        </p>
      </Shell>
    );
  }

  const subdomain = await getSubdomainByName(name).catch(() => null);

  if (!subdomain || subdomain.status !== 'active') {
    const expired = subdomain?.status === 'expired';
    return (
      <Shell title={name} hint={hint}>
        <p className="text-lg font-medium">
          {expired ? 'Срок этого поддомена истёк' : 'Поддомен свободен'}
        </p>
        <p className="text-muted-foreground">
          {expired
            ? 'Владелец зоны или поддомена не продлил его. Метку может занять владелец зоны.'
            : `Поддомены создаёт владелец зоны ${tld} — у него же можно попросить ${subLabel}.`}
        </p>
        <a className="text-sm underline" href={`${appUrl}/zone/${encodeURIComponent(tld)}`}>
          Открыть зону {tld} →
        </a>
      </Shell>
    );
  }

  const target = redirectTarget(subdomain.metadata);
  if (target) redirect(target);

  const metadata = prettyMetadata(subdomain.metadata);
  return (
    <Shell title={name} hint={hint}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">активен</span>
        <span className="text-muted-foreground">
          до {formatDateTime(new Date(subdomain.expiresAt), 'ru')}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Владелец</dt>
          <dd className="mono break-all text-sm">
            <a
              className="underline decoration-dotted hover:text-foreground"
              href={explorerUrl('address', subdomain.ownerAddress)}
            >
              {subdomain.ownerAddress}
            </a>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Зона</dt>
          <dd className="text-sm">
            <a className="underline" href={`${appUrl}/zone/${encodeURIComponent(tld)}`}>
              {tld}
            </a>{' '}
            <span className="text-muted-foreground">
              (владелец зоны {shortenAddress(subdomain.zoneOwnerAddress)})
            </span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Зарегистрирован</dt>
          <dd className="text-sm">{formatDateTime(new Date(subdomain.registeredAt), 'ru')}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Метка</dt>
          <dd className="text-sm">
            {subdomain.label} <span className="text-muted-foreground">в {tld}</span>
          </dd>
        </div>
      </dl>

      {metadata ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Метаданные</p>
          <pre className="mono mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {metadata}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Владелец не указал адрес сайта в метаданных поддомена.
        </p>
      )}
    </Shell>
  );
}

/** Ссылки в собственный обозреватель сайта: /address/<адрес>, /tx/<хеш>. */
function explorerUrl(kind: 'address' | 'tx', value: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://justtld.onrender.com').replace(
    /\/+$/,
    '',
  );
  return `${appUrl}/${kind}/${value}`;
}

function redirectTarget(metadata: string): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const candidate = parsed.url ?? parsed.site ?? parsed.redirect;
    if (typeof candidate !== 'string') return null;
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function prettyMetadata(metadata: string): string {
  if (!metadata) return '';
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
}

function Shell({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="container flex min-h-[70vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">JustTLD resolver</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Данные читаются из блокчейна через индексер. Имя принадлежит владельцу кошелька, а не
        серверу.
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </main>
  );
}
