import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, computeCatalogPrice, isReservedTld, type PaymentOrderDto } from '@justtld/shared';
import {
  boostAuction,
  boostStoreListing,
  createAdSlot,
  createPaymentOrder,
  getCustody,
  getPaymentOrderById,
  getStoreListingById,
  getStorePricing,
  getSubdomainByName,
  getZoneByTld,
  linkAuctionOrder,
  markAuctionSettled,
  markListingSold,
  recordSellerEarning,
  setSiteProUnlocked,
  updatePaymentOrder,
  upsertCustody,
  upsertSiteFile,
  upsertSiteSettings,
  listSiteFiles,
} from '@justtld/db';
import type { AdPlacement, OrderKind, PaymentProvider } from '@justtld/shared';
import {
  appUrl,
  cryptoBotToken,
  paymentsSandbox,
  yoomoneySecret,
  yoomoneyWallet,
} from './config';

export function paymentGatewaysStatus() {
  return {
    yoomoneyConfigured: Boolean(yoomoneyWallet() && yoomoneySecret()),
    yoomoneyWalletMasked: yoomoneyWallet()
      ? `${yoomoneyWallet().slice(0, 5)}…${yoomoneyWallet().slice(-4)}`
      : null,
    cryptoBotConfigured: Boolean(cryptoBotToken()),
    sandboxEnabled: paymentsSandbox(),
  };
}

/** Ссылка Quickpay ЮMoney (работает с именным статусом физлица + HTTP-уведомления). */
export function buildYooMoneyQuickpayUrl(order: PaymentOrderDto): string {
  const receiver = yoomoneyWallet();
  if (!receiver) {
    throw new ApiError(
      503,
      'YOOMONEY_NOT_CONFIGURED',
      'Кошелёк ЮMoney не настроен в переменных окружения (YOOMONEY_WALLET)',
    );
  }
  const assetName = order.subLabel ? `${order.subLabel}${order.tld}` : order.tld;
  const params = new URLSearchParams({
    receiver,
    'quickpay-form': 'button',
    'paymentType': 'AC',
    sum: Number(order.amount).toFixed(2),
    label: order.id,
    targets: `JustTLD: ${assetName}`,
    successURL: `${appUrl().replace(/\/+$/, '')}/store?order=${order.id}`,
  });
  return `https://yoomoney.ru/quickpay/confirm?${params.toString()}`;
}

/** Проверяет SHA-1 подпись HTTP-уведомления ЮMoney. */
export function verifyYooMoneyNotificationSignature(params: {
  notification_type: string;
  operation_id: string;
  amount: string;
  currency: string;
  datetime: string;
  sender: string;
  codepro: string;
  label: string;
  sha1_hash: string;
}): boolean {
  const secret = yoomoneySecret();
  if (!secret) return false;
  const raw = [
    params.notification_type,
    params.operation_id,
    params.amount,
    params.currency,
    params.datetime,
    params.sender,
    params.codepro,
    secret,
    params.label,
  ].join('&');
  const expected = createHash('sha1').update(raw).digest('hex').toLowerCase();
  const got = (params.sha1_hash ?? '').trim().toLowerCase();
  if (expected.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

/** Создаёт счёт в @CryptoBot (Crypto Pay API: USDT / TON / BTC / ETH). */
export async function createCryptoBotInvoice(input: {
  orderId: string;
  amount: string;
  asset: string;
  description: string;
}): Promise<{ invoiceId: string; payUrl: string }> {
  const token = cryptoBotToken();
  if (!token) {
    throw new ApiError(
      503,
      'CRYPTOBOT_NOT_CONFIGURED',
      'Токен @CryptoBot не настроен в переменных окружения (CRYPTOBOT_API_TOKEN)',
    );
  }
  const response = await fetch('https://pay.crypt.bot/api/createInvoice', {
    method: 'POST',
    headers: {
      'Crypto-Pay-API-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      asset: input.asset.toUpperCase(),
      amount: input.amount,
      description: input.description,
      payload: input.orderId,
      paid_btn_name: 'openBot',
      paid_btn_url: `${appUrl().replace(/\/+$/, '')}/store?order=${input.orderId}`,
      allow_comments: false,
      allow_anonymous: true,
    }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    result?: { invoice_id?: number; bot_invoice_url?: string; pay_url?: string };
    error?: { name?: string };
  };
  if (!response.ok || !payload.ok || !payload.result?.invoice_id) {
    throw new ApiError(
      502,
      'CRYPTOBOT_ERROR',
      `Ошибка @CryptoBot: ${payload.error?.name ?? response.status}`,
    );
  }
  return {
    invoiceId: String(payload.result.invoice_id),
    payUrl: payload.result.bot_invoice_url ?? payload.result.pay_url ?? '',
  };
}

/** Проверяет статус инвойса @CryptoBot через getInvoices (для мгновенной проверки кнопкой). */
export async function fetchCryptoBotInvoiceStatus(invoiceId: string): Promise<string | null> {
  const token = cryptoBotToken();
  if (!token) return null;
  const response = await fetch(
    `https://pay.crypt.bot/api/getInvoices?invoice_ids=${encodeURIComponent(invoiceId)}`,
    {
      headers: { 'Crypto-Pay-API-Token': token },
    },
  );
  const payload = (await response.json()) as {
    ok?: boolean;
    result?: { items?: Array<{ status?: string }> };
  };
  return payload.result?.items?.[0]?.status ?? null;
}

/** Проверяет HMAC-SHA256 подпись вебхука Crypto Pay API. */
export function verifyCryptoBotWebhookSignature(rawBody: string, signature: string | null): boolean {
  const token = cryptoBotToken();
  if (!token || !signature) return false;
  const secret = createHash('sha256').update(token).digest();
  const hmac = createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = signature.trim().toLowerCase();
  if (hmac.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(hmac), Buffer.from(got));
}

function starterHtml(tld: string, subLabel: string): string {
  const domain = subLabel ? `${subLabel}.${tld.replace(/^\./, '')}.justtld.online` : `${tld.replace(/^\./, '')}.justtld.online`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${domain}</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <main class="card">
    <span class="badge">JustTLD Hosting</span>
    <h1>${domain}</h1>
    <p>Этот сайт создан автоматически после покупки домена. Отредактируйте <code>index.html</code> и <code>style.css</code> в файловом менеджере личного кабинета.</p>
  </main>
</body>
</html>
`;
}

const STARTER_CSS = `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  background: radial-gradient(circle at top, #1f1638, #0b0d17 70%);
  color: #f4f4f8;
}
.card {
  max-width: 540px;
  margin: 24px;
  padding: 32px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
}
h1 { margin: 14px 0 10px; font-size: 28px; word-break: break-word; }
p { margin: 0; color: #b8bfd6; line-height: 1.6; }
code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 6px; }
`;

export async function ensureStarterSite(
  tld: string,
  subLabel = '',
  ownerAddress = 'system',
): Promise<void> {
  const existingFiles = await listSiteFiles(tld, subLabel);
  if (existingFiles.length === 0) {
    await upsertSiteFile({
      tld,
      subLabel,
      path: 'index.html',
      content: Buffer.from(starterHtml(tld, subLabel), 'utf8'),
      mimeType: 'text/html; charset=utf-8',
      updatedBy: ownerAddress,
    });
    await upsertSiteFile({
      tld,
      subLabel,
      path: 'style.css',
      content: Buffer.from(STARTER_CSS, 'utf8'),
      mimeType: 'text/css; charset=utf-8',
      updatedBy: ownerAddress,
    });
    await upsertSiteSettings({
      tld,
      subLabel,
      mode: 'hosting',
      entryFile: 'index.html',
      spaFallback: false,
    });
  }
}

export async function createCheckoutOrder(input: {
  buyerAddress: string;
  buyerEmail?: string | null;
  kind: OrderKind;
  listingId?: string;
  tld?: string;
  subLabel?: string;
  catalogPrice?: boolean;
  provider: PaymentProvider;
  currency?: string;
  periodDays?: number;
}): Promise<{ order: PaymentOrderDto; payUrl: string | null; instructions: string }> {
  const pricing = await getStorePricing();
  let tld = (input.tld ?? '').trim().toLowerCase();
  let subLabel = (input.subLabel ?? '').trim().toLowerCase();
  let priceRub = pricing.customZonePriceRub;
  let priceUsdt = pricing.customZonePriceUsdt;
  let periodDays = input.periodDays ?? 365;
  let listingId: string | null = null;

  if (input.kind === 'listing') {
    if (!input.listingId) {
      throw ApiError.badRequest('MISSING_LISTING', 'Укажите id лота');
    }
    const listing = await getStoreListingById(input.listingId);
    if (!listing || listing.status !== 'available') {
      throw ApiError.conflict('LISTING_UNAVAILABLE', 'Этот лот уже продан или снят с витрины');
    }
    listingId = listing.id;
    tld = listing.tld;
    subLabel = listing.subLabel;
    priceRub = listing.priceRub;
    priceUsdt = listing.priceUsdt;
    periodDays = listing.periodDays;
  } else {
    if (!tld) {
      throw ApiError.badRequest('MISSING_TLD', 'Укажите имя зоны');
    }
    if (isReservedTld(tld)) {
      throw ApiError.badRequest('TLD_RESERVED', `Зона ${tld} зарезервирована системой`);
    }
    if (input.kind === 'custom_zone') {
      if (!pricing.customZoneEnabled && !input.catalogPrice) {
        throw ApiError.forbidden('Покупка произвольных зон отключена администратором');
      }
      const [existingZone, existingCustody] = await Promise.all([
        getZoneByTld(tld),
        getCustody(tld, ''),
      ]);
      const nowMs = Date.now();
      const occupied =
        (existingZone && existingZone.status === 'active') ||
        (existingCustody && new Date(existingCustody.expiresAt).getTime() > nowMs);
      if (occupied) {
        throw ApiError.conflict('ZONE_TAKEN', `Зона ${tld} уже занята`);
      }
      const years = Math.max(1, Math.round(periodDays / 365));
      if (input.catalogPrice) {
        const dynamic = computeCatalogPrice(tld, '');
        priceRub = dynamic.priceRub * years;
        priceUsdt = Number((dynamic.priceUsdt * years).toFixed(2));
      } else {
        priceRub = pricing.customZonePriceRub * years;
        priceUsdt = Number((pricing.customZonePriceUsdt * years).toFixed(2));
      }
    } else if (input.kind === 'custom_subdomain') {
      if ((!pricing.customSubdomainEnabled && !input.catalogPrice) || !subLabel) {
        throw ApiError.badRequest('INVALID_SUBDOMAIN_ORDER', 'Укажите поддомен');
      }
      if (
        !/^[a-z0-9-]+$/.test(subLabel) ||
        subLabel.startsWith('-') ||
        subLabel.endsWith('-') ||
        subLabel.includes('--')
      ) {
        throw ApiError.badRequest('LABEL_INVALID', 'Некорректное имя поддомена');
      }
      const fullSubName = `${subLabel}.${tld.replace(/^\./, '')}`;
      const [existingSub, existingSubCustody, parentZone, parentCustody] = await Promise.all([
        getSubdomainByName(fullSubName),
        getCustody(tld, subLabel),
        getZoneByTld(tld),
        getCustody(tld, ''),
      ]);
      const nowMs = Date.now();
      const subOccupied =
        (existingSub && existingSub.status === 'active') ||
        (existingSubCustody && new Date(existingSubCustody.expiresAt).getTime() > nowMs);
      if (subOccupied) {
        throw ApiError.conflict('SUBDOMAIN_TAKEN', `Поддомен ${fullSubName} уже занят`);
      }
      const parentOwner =
        parentZone && parentZone.status === 'active'
          ? parentZone.ownerAddress.toLowerCase()
          : parentCustody && new Date(parentCustody.expiresAt).getTime() > nowMs
            ? parentCustody.ownerAddress.toLowerCase()
            : null;
      if (parentOwner && parentOwner !== input.buyerAddress.toLowerCase()) {
        throw ApiError.conflict(
          'PARENT_ZONE_OWNED',
          `Зона ${tld} принадлежит другому владельцу — выберите поддомен в свободной зоне`,
        );
      }
      if (input.catalogPrice) {
        const dynamic = computeCatalogPrice(tld, subLabel);
        priceRub = dynamic.priceRub;
        priceUsdt = dynamic.priceUsdt;
      } else {
        priceRub = pricing.customSubdomainPriceRub;
        priceUsdt = pricing.customSubdomainPriceUsdt;
      }
    }
  }

  if (input.provider === 'sandbox' && !paymentsSandbox()) {
    throw ApiError.forbidden('Тестовая оплата (Sandbox) отключена');
  }

  const currency =
    input.provider === 'yoomoney'
      ? 'RUB'
      : input.provider === 'cryptobot'
        ? (input.currency && input.currency !== 'RUB' ? input.currency : 'USDT')
        : 'RUB';
  const amount =
    currency === 'RUB' ? priceRub.toFixed(2) : priceUsdt.toFixed(2);

  const order = await createPaymentOrder({
    buyerAddress: input.buyerAddress,
    buyerEmail: input.buyerEmail ?? null,
    tld,
    subLabel,
    kind: input.kind,
    listingId,
    provider: input.provider,
    currency,
    amount,
    meta: { periodDays },
  });

  if (input.provider === 'yoomoney') {
    const payUrl = buildYooMoneyQuickpayUrl(order);
    const updated =
      (await updatePaymentOrder(order.id, { payUrl })) ?? order;
    return {
      order: updated,
      payUrl,
      instructions:
        'Перейдите по ссылке ЮMoney для оплаты банковской картой или кошельком. После оплаты зона активируется автоматически.',
    };
  }

  if (input.provider === 'cryptobot') {
    const assetName = subLabel ? `${subLabel}${tld}` : tld;
    const inv = await createCryptoBotInvoice({
      orderId: order.id,
      amount,
      asset: currency,
      description: `JustTLD: ${assetName} (${periodDays} дн.)`,
    });
    const updated =
      (await updatePaymentOrder(order.id, {
        externalId: inv.invoiceId,
        payUrl: inv.payUrl,
      })) ?? order;
    return {
      order: updated,
      payUrl: inv.payUrl,
      instructions:
        'Оплатите счёт в Telegram @CryptoBot. Затем нажмите «Проверить оплату» или дождитесь автоматического вебхука.',
    };
  }

  return {
    order,
    payUrl: null,
    instructions:
      'Заказ создан в тестовом режиме (Sandbox). Нажмите «Тестово подтвердить оплату» для мгновенной проверки выдачи зоны и сайта.',
  };
}

export async function syncCryptoBotOrderStatus(
  order: PaymentOrderDto,
): Promise<PaymentOrderDto> {
  if (order.status !== 'pending' || order.provider !== 'cryptobot' || !order.externalId) {
    return order;
  }
  const status = await fetchCryptoBotInvoiceStatus(order.externalId);
  if (status === 'paid') {
    return fulfillPaymentOrder(order.id, { externalId: order.externalId });
  }
  if (status === 'expired') {
    return (await updatePaymentOrder(order.id, { status: 'expired' })) ?? order;
  }
  return order;
}

/**
 * Идемпотентно выдаёт купленную зону/поддомен покупателю и включает хостинг со стартовым сайтом.
 */
export async function fulfillPaymentOrder(
  orderId: string,
  extra?: { externalId?: string; txHash?: string },
): Promise<PaymentOrderDto> {
  const order = await getPaymentOrderById(orderId);
  if (!order) {
    throw ApiError.notFound('Заказ не найден');
  }
  if (order.status === 'fulfilled') return order;

  if (order.kind === 'site_pro') {
    await setSiteProUnlocked(order.tld, order.subLabel, true);
  } else if (order.kind === 'boost_listing') {
    const targetId = typeof order.meta?.targetId === 'string' ? order.meta.targetId : '';
    if (targetId) await boostStoreListing(targetId, 7);
  } else if (order.kind === 'boost_auction') {
    const targetId = typeof order.meta?.targetId === 'string' ? order.meta.targetId : '';
    if (targetId) await boostAuction(targetId, 7);
  } else if (order.kind === 'ad_slot') {
    const ad = (order.meta?.ad ?? {}) as Partial<{
      placement: AdPlacement;
      title: string;
      description: string;
      ctaLabel: string;
      targetUrl: string;
      badgeText: string;
    }>;
    if (ad.placement && ad.title && ad.targetUrl) {
      await createAdSlot({
        placement: ad.placement,
        title: ad.title,
        description: ad.description ?? '',
        ctaLabel: ad.ctaLabel ?? 'Открыть',
        targetUrl: ad.targetUrl,
        badgeText: ad.badgeText ?? 'Реклама',
        ownerAddress: order.buyerAddress,
        orderId: order.id,
        days: 7,
        isActive: true,
      });
    }
  } else {
    const periodDays = Number(order.meta?.periodDays ?? 365) || 365;

    await upsertCustody({
      tld: order.tld,
      subLabel: order.subLabel,
      ownerAddress: order.buyerAddress,
      source: 'order',
      orderId: order.id,
      periodDays,
    });

    if (order.listingId) {
      const listing = await getStoreListingById(order.listingId);
      await markListingSold(order.listingId, order.buyerAddress);
      if (listing?.sellerAddress && listing.sellerAddress !== order.buyerAddress.toLowerCase()) {
        await recordSellerEarning({
          sellerAddress: listing.sellerAddress,
          orderId: order.id,
          listingId: listing.id,
          tld: listing.subLabel ? `${listing.subLabel}${listing.tld}` : listing.tld,
          grossRub: listing.priceRub,
          feePercent: listing.feePercent ?? 10,
        });
      }
    }

    if (order.kind === 'auction' && typeof order.meta?.auctionId === 'string') {
      await markAuctionSettled(order.meta.auctionId, order.id);
    }

    await ensureStarterSite(order.tld, order.subLabel, order.buyerAddress);
  }

  const updated = await updatePaymentOrder(order.id, {
    status: 'fulfilled',
    paidAt: true,
    fulfilledAt: true,
    externalId: extra?.externalId ?? undefined,
    txHash: extra?.txHash ?? undefined,
  });
  return updated ?? order;
}

export const MONETIZATION_PRICES = {
  site_pro: { rub: 190, usdt: 2, label: 'PRO без копирайта' },
  boost_listing: { rub: 99, usdt: 1, label: 'ТОП-лот на 7 дней' },
  boost_auction: { rub: 99, usdt: 1, label: 'ТОП-аукцион на 7 дней' },
  ad_slot: { rub: 290, usdt: 3, label: 'Рекламный блок на 7 дней' },
} as const;

export async function createMonetizationOrder(input: {
  buyerAddress: string;
  buyerEmail?: string | null;
  kind: 'site_pro' | 'boost_listing' | 'boost_auction' | 'ad_slot';
  tld?: string;
  subLabel?: string;
  targetId?: string;
  ad?: {
    placement: AdPlacement;
    title: string;
    description: string;
    ctaLabel: string;
    targetUrl: string;
    badgeText: string;
  };
  provider: PaymentProvider;
  currency?: string;
}): Promise<{ order: PaymentOrderDto; payUrl: string | null; instructions: string }> {
  if (input.provider === 'sandbox' && !paymentsSandbox()) {
    throw ApiError.forbidden('Тестовая оплата (Sandbox) отключена');
  }

  const price = MONETIZATION_PRICES[input.kind];
  const currency =
    input.provider === 'yoomoney'
      ? 'RUB'
      : input.provider === 'cryptobot'
        ? (input.currency && input.currency !== 'RUB' ? input.currency : 'USDT')
        : 'RUB';
  const amount = currency === 'RUB' ? price.rub.toFixed(2) : price.usdt.toFixed(2);
  const tld = (input.tld ?? '.site').toLowerCase();
  const subLabel = (input.subLabel ?? '').toLowerCase();

  const order = await createPaymentOrder({
    buyerAddress: input.buyerAddress,
    buyerEmail: input.buyerEmail ?? null,
    tld,
    subLabel,
    kind: input.kind,
    listingId: null,
    provider: input.provider,
    currency,
    amount,
    meta: {
      targetId: input.targetId ?? null,
      ad: input.ad ?? null,
    },
  });

  if (input.provider === 'yoomoney') {
    const payUrl = buildYooMoneyQuickpayUrl(order);
    const updated = (await updatePaymentOrder(order.id, { payUrl })) ?? order;
    return {
      order: updated,
      payUrl,
      instructions: `Оплатите «${price.label}» через ЮMoney — опция активируется автоматически.`,
    };
  }

  if (input.provider === 'cryptobot') {
    const inv = await createCryptoBotInvoice({
      orderId: order.id,
      amount,
      asset: currency,
      description: `JustTLD: ${price.label}`,
    });
    const updated =
      (await updatePaymentOrder(order.id, {
        externalId: inv.invoiceId,
        payUrl: inv.payUrl,
      })) ?? order;
    return {
      order: updated,
      payUrl: inv.payUrl,
      instructions: 'Оплатите счёт в @CryptoBot и нажмите «Проверить оплату».',
    };
  }

  return {
    order,
    payUrl: null,
    instructions: 'Счёт создан в тестовом режиме (Sandbox).',
  };
}

/** Создаёт счёт на оплату выигранного аукциона по итоговой ставке. */
export async function createAuctionSettlementOrder(input: {
  auctionId: string;
  tld: string;
  amountRub: number;
  buyerAddress: string;
  buyerEmail?: string | null;
  provider: PaymentProvider;
  currency?: string;
}): Promise<{ order: PaymentOrderDto; payUrl: string | null; instructions: string }> {
  if (input.provider === 'sandbox' && !paymentsSandbox()) {
    throw ApiError.forbidden('Тестовая оплата (Sandbox) отключена');
  }

  const pricing = await getStorePricing();
  const rubPerUsdt =
    pricing.customZonePriceUsdt > 0
      ? pricing.customZonePriceRub / pricing.customZonePriceUsdt
      : 95;
  const currency =
    input.provider === 'yoomoney'
      ? 'RUB'
      : input.provider === 'cryptobot'
        ? (input.currency && input.currency !== 'RUB' ? input.currency : 'USDT')
        : 'RUB';
  const amount =
    currency === 'RUB'
      ? input.amountRub.toFixed(2)
      : Math.max(0.5, input.amountRub / rubPerUsdt).toFixed(2);

  const order = await createPaymentOrder({
    buyerAddress: input.buyerAddress,
    buyerEmail: input.buyerEmail ?? null,
    tld: input.tld,
    subLabel: '',
    kind: 'auction',
    listingId: null,
    provider: input.provider,
    currency,
    amount,
    meta: { periodDays: 365, auctionId: input.auctionId },
  });

  await linkAuctionOrder(input.auctionId, order.id);

  if (input.provider === 'yoomoney') {
    const payUrl = buildYooMoneyQuickpayUrl(order);
    const updated = (await updatePaymentOrder(order.id, { payUrl })) ?? order;
    return {
      order: updated,
      payUrl,
      instructions:
        'Оплатите выигранную ставку через ЮMoney — зона и стартовый сайт перейдут к вам автоматически.',
    };
  }

  if (input.provider === 'cryptobot') {
    const inv = await createCryptoBotInvoice({
      orderId: order.id,
      amount,
      asset: currency,
      description: `JustTLD Auction: ${input.tld} (365 дн.)`,
    });
    const updated =
      (await updatePaymentOrder(order.id, {
        externalId: inv.invoiceId,
        payUrl: inv.payUrl,
      })) ?? order;
    return {
      order: updated,
      payUrl: inv.payUrl,
      instructions:
        'Оплатите счёт в @CryptoBot и нажмите «Проверить статус» или дождитесь авто-подтверждения.',
    };
  }

  return {
    order,
    payUrl: null,
    instructions: 'Счёт создан в тестовом режиме (Sandbox).',
  };
}
