import { ApiError } from '@justtld/shared';
import { getCustody, getSubdomainByName, getZoneByTld } from '@justtld/db';
import { getSessionFromRequest } from './auth';
import { adminAddress, subdomainsEnabled } from './config';
import { readChainZone } from './chain';
import { readChainSubdomain, subdomainName } from './subdomains';

export type AssetOwnership = {
  exists: boolean;
  isOwner: boolean;
  isZoneOwner: boolean;
  zoneOwner: string | null;
  assetOwner: string | null;
  via: 'admin' | 'chain' | 'custody' | 'none';
};

/**
 * Единая проверка владения зоной или поддоменом:
 *  - владелец на блокчейне (`JustTLDRegistry` / `JustTLDSubdomains`),
 *  - ИЛИ покупатель с активной записью в `zone_custody` (купленной за RUB / USDT / TON),
 *  - ИЛИ администратор платформы.
 */
export async function checkAssetOwnership(
  tld: string,
  subLabel: string,
  viewerAddress: string | null,
): Promise<AssetOwnership> {
  const viewer = viewerAddress?.toLowerCase() ?? null;
  const admin = adminAddress();
  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();

  const [chainZone, cachedZone, zoneCustody] = await Promise.all([
    readChainZone(tld).catch(() => null),
    getZoneByTld(tld).catch(() => null),
    getCustody(tld, '').catch(() => null),
  ]);

  const activeCustodyZone =
    zoneCustody && new Date(zoneCustody.expiresAt).getTime() > nowMs ? zoneCustody : null;

  const zoneOwner =
    chainZone && !chainZone.blocked && chainZone.expiresAt > nowSec
      ? chainZone.owner.toLowerCase()
      : activeCustodyZone
        ? activeCustodyZone.ownerAddress.toLowerCase()
        : cachedZone && cachedZone.status !== 'blocked' && new Date(cachedZone.expiresAt).getTime() > nowMs
          ? cachedZone.ownerAddress.toLowerCase()
          : null;

  const isZoneOwner = Boolean(viewer && zoneOwner && viewer === zoneOwner);

  if (!subLabel) {
    const exists = Boolean(chainZone || cachedZone || activeCustodyZone);
    const isAdmin = Boolean(viewer && admin && viewer === admin);
    return {
      exists,
      isOwner: isZoneOwner || isAdmin,
      isZoneOwner: isZoneOwner || isAdmin,
      zoneOwner,
      assetOwner: zoneOwner,
      via: isAdmin
        ? 'admin'
        : chainZone && viewer === chainZone.owner.toLowerCase()
          ? 'chain'
          : activeCustodyZone && viewer === activeCustodyZone.ownerAddress.toLowerCase()
            ? 'custody'
            : 'none',
    };
  }

  const fullName = subdomainName(tld, subLabel);
  const [chainSub, cachedSub, subCustody] = await Promise.all([
    subdomainsEnabled() ? readChainSubdomain(tld, subLabel).catch(() => null) : Promise.resolve(null),
    getSubdomainByName(fullName).catch(() => null),
    getCustody(tld, subLabel).catch(() => null),
  ]);

  const activeCustodySub =
    subCustody && new Date(subCustody.expiresAt).getTime() > nowMs ? subCustody : null;

  const subOwner =
    chainSub && !chainSub.blocked && chainSub.expiresAt > nowSec
      ? chainSub.owner.toLowerCase()
      : activeCustodySub
        ? activeCustodySub.ownerAddress.toLowerCase()
        : cachedSub && cachedSub.status !== 'blocked' && new Date(cachedSub.expiresAt).getTime() > nowMs
          ? cachedSub.ownerAddress.toLowerCase()
          : null;

  const exists = Boolean(chainSub || cachedSub || activeCustodySub);
  const isSubOwner = Boolean(viewer && subOwner && viewer === subOwner);
  const isAdmin = Boolean(viewer && admin && viewer === admin);

  return {
    exists,
    isOwner: isSubOwner || isZoneOwner || isAdmin,
    isZoneOwner: isZoneOwner || isAdmin,
    zoneOwner,
    assetOwner: subOwner ?? zoneOwner,
    via: isAdmin
      ? 'admin'
      : chainSub && viewer === chainSub.owner.toLowerCase()
        ? 'chain'
        : activeCustodySub && viewer === activeCustodySub.ownerAddress.toLowerCase()
          ? 'custody'
          : isZoneOwner
            ? 'chain'
            : 'none',
  };
}

/** Требует авторизованную сессию (`justtld_session`) и владение зоной/поддоменом. */
export async function requireAssetOwner(request: Request, tld: string, subLabel = '') {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw ApiError.unauthorized(
      'Войдите в кабинет (подписью кошелька или через Email/пароль), чтобы управлять сайтом и DNS',
    );
  }
  const ownership = await checkAssetOwnership(tld, subLabel, session.address);
  if (!ownership.exists) {
    throw ApiError.notFound('Зона или поддомен не найдены');
  }
  if (!ownership.isOwner && session.role !== 'admin') {
    throw ApiError.forbidden('Управлять сайтом и DNS может только владелец этой зоны/поддомена');
  }
  return { session, ownership };
}
