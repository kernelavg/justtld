// @vitest-environment node
/**
 * API поддоменов: список, карточка и четыре prepare-маршрута.
 *
 * Тесты герметичные: база, RPC и контракт заменены моками, поэтому проверяем именно
 * поведение роутов — коды ошибок, валидацию, порядок «сначала simulate, потом intent»
 * и форму ответа. Контрактные тесты живут отдельно в contracts/test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@justtld/shared';

// ── моки инфраструктуры ────────────────────────────────────────────────────────
const state = {
  enabled: true,
  zone: null as null | { ownerAddress: string; blocked: boolean; expiresAt: number },
  subdomainCache: null as null | Record<string, unknown>,
  subdomainsList: {
    items: [] as Array<Record<string, unknown>>,
    total: 0,
    page: 1,
    limit: 50,
    pages: 1,
  },
  events: { items: [] as Array<Record<string, unknown>>, total: 0, page: 1, limit: 20, pages: 1 },
  chainSubdomain: null as null | {
    owner: string;
    zoneOwner: string;
    registeredAt: number;
    expiresAt: number;
    updatedAt: number;
    blocked: boolean;
    metadata: string;
  },
  chainZone: null as null | { owner: string; blocked: boolean; expiresAt: number },
  simulateError: null as null | Error,
  calls: {
    simulate: [] as Array<Record<string, unknown>>,
    intents: [] as Array<Record<string, unknown>>,
  },
};

const dbMock = {
  getZoneByTld: vi.fn(async () => state.zone),
  listSubdomainsByZone: vi.fn(async () => state.subdomainsList),
  refreshExpiredSubdomainStatuses: vi.fn(async () => 0),
  getSubdomainByName: vi.fn(async () => state.subdomainCache),
  listSubdomainEvents: vi.fn(async () => state.events),
  createIntent: vi.fn(async (input: Record<string, unknown>) => {
    state.calls.intents.push(input);
    return { id: 'intent-1', expiresAt: '2026-11-21T12:00:00.000Z' };
  }),
};

vi.mock('@justtld/db', () => dbMock);

vi.mock('@/lib/server/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/config')>();
  return {
    ...actual,
    subdomainsEnabled: () => state.enabled,
    subdomainsAddress: () => '0xa6565Dc205b2Af794ff4582dB1A6438CDF922c35',
    chainId: () => 11155111,
  };
});

vi.mock('@/lib/server/tx', () => ({
  buildSubdomainTransferTx: undefined,
  buildSubdomainTx: (input: { functionName: string; args: unknown[]; sender: string }) => ({
    to: '0xa6565Dc205b2Af794ff4582dB1A6438CDF922c35',
    data: `0xMOCK${input.functionName}`,
    value: '0',
    from: input.sender,
    args: input.args,
  }),
  simulateSubdomainCall: async (input: Record<string, unknown>) => {
    state.calls.simulate.push(input);
    if (state.simulateError) throw state.simulateError;
    return { ok: true };
  },
}));

vi.mock('@/lib/server/subdomains', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/subdomains')>();
  return {
    ...actual,
    readChainSubdomain: async () => state.chainSubdomain,
    chainSubdomainToDto: (tld: string, label: string, sub: { owner: string }) => ({
      name: `${label}${tld}`,
      tld,
      label,
      ownerAddress: sub.owner,
      status: 'active',
    }),
  };
});

vi.mock('@/lib/server/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/chain')>();
  return {
    ...actual,
    readChainZone: async () => state.chainZone,
  };
});

const { GET: listSubdomains } = await import('@/app/api/zones/[tld]/subdomains/route');
const { GET: getSubdomain } = await import('@/app/api/zones/[tld]/subdomains/[label]/route');
const { POST: prepareRegistration } =
  await import('@/app/api/subdomains/prepare-registration/route');
const { POST: prepareTransfer } = await import('@/app/api/subdomains/prepare-transfer/route');
const { POST: prepareMetadata } = await import('@/app/api/subdomains/prepare-metadata/route');
const { POST: prepareRenewal } = await import('@/app/api/subdomains/prepare-renewal/route');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const ZONE_OWNER = '0x2ba51777889785cC53871463Bf8e4db95Fc8d886';
// Схемы нормализуют адреса в нижний регистр — сравниваем в нижнем.
const ZONE_OWNER_LC = ZONE_OWNER.toLowerCase();
const STRANGER = '0x1111111111111111111111111111111111111111';
const FUTURE = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;

function get(path: string) {
  return new Request(`http://localhost:3000${path}`, { method: 'GET' });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function tldContext(tld: string) {
  return { params: Promise.resolve({ tld }) };
}

function labelContext(tld: string, label: string) {
  return { params: Promise.resolve({ tld, label }) };
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  resetRateLimits();
  state.enabled = true;
  state.zone = { ownerAddress: ZONE_OWNER, blocked: false, expiresAt: FUTURE };
  state.subdomainCache = null;
  state.subdomainsList = { items: [], total: 0, page: 1, limit: 50, pages: 1 };
  state.events = { items: [], total: 0, page: 1, limit: 20, pages: 1 };
  state.chainSubdomain = null;
  state.chainZone = { owner: ZONE_OWNER, blocked: false, expiresAt: FUTURE };
  state.simulateError = null;
  state.calls.simulate = [];
  state.calls.intents = [];
  vi.clearAllMocks();
});

describe('GET /api/zones/[tld]/subdomains', () => {
  it('отвечает 501, когда контракт поддоменов не подключён', async () => {
    state.enabled = false;
    const response = await listSubdomains(
      get('/api/zones/.femboy/subdomains'),
      tldContext('.femboy'),
    );
    expect(response.status).toBe(501);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'SUBDOMAINS_DISABLED' });
    expect(dbMock.listSubdomainsByZone).not.toHaveBeenCalled();
  });

  it('отвергает зону с недопустимыми символами', async () => {
    const response = await listSubdomains(
      get('/api/zones/.fem!boy/subdomains'),
      tldContext('.fem!boy'),
    );
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'INVALID_TLD' });
  });

  it('прощает косметический ввод: пробелы вычищаются, регистр приводится', async () => {
    // normalizeTld удаляет пробелы и приводит к нижнему регистру: «Fem boy» → .femboy.
    const response = await listSubdomains(
      get('/api/zones/Fem boy/subdomains'),
      tldContext('Fem boy'),
    );
    expect(response.status).toBe(200);
    expect(dbMock.listSubdomainsByZone).toHaveBeenCalledWith('.femboy', expect.anything());
  });

  it('отдаёт список, владельца зоны и пагинацию', async () => {
    state.subdomainsList = {
      items: [{ id: '1', name: 'blog.femboy', label: 'blog', tld: '.femboy', status: 'active' }],
      total: 1,
      page: 2,
      limit: 10,
      pages: 1,
    };
    const response = await listSubdomains(
      get('/api/zones/.femboy/subdomains?page=2&limit=10'),
      tldContext('.femboy'),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body).toMatchObject({
      tld: '.femboy',
      zoneOwner: ZONE_OWNER,
      total: 1,
      page: 2,
      pages: 1,
    });
    expect(state.subdomainsList.items).toHaveLength(1);
    expect(dbMock.listSubdomainsByZone).toHaveBeenCalledWith('.femboy', { page: 2, limit: 10 });
  });

  it('зажимает limit в допустимые границы', async () => {
    await listSubdomains(
      get('/api/zones/.femboy/subdomains?page=0&limit=9999'),
      tldContext('.femboy'),
    );
    expect(dbMock.listSubdomainsByZone).toHaveBeenCalledWith('.femboy', { page: 1, limit: 200 });
  });

  it('не падает, если зоны нет в кэше', async () => {
    state.zone = null;
    const response = await listSubdomains(
      get('/api/zones/.femboy/subdomains'),
      tldContext('.femboy'),
    );
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).zoneOwner).toBeNull();
  });
});

describe('GET /api/zones/[tld]/subdomains/[label]', () => {
  it('отвергает некорректную метку и метку длиннее 32 символов', async () => {
    const response = await getSubdomain(
      get('/api/zones/.femboy/subdomains/a b'),
      labelContext('.femboy', 'a b'),
    );
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'INVALID_LABEL' });

    const tooLong = await getSubdomain(
      get(`/api/zones/.femboy/subdomains/${'a'.repeat(33)}`),
      labelContext('.femboy', 'a'.repeat(33)),
    );
    expect(tooLong.status).toBe(400);
    expect((await bodyOf(tooLong)).error).toMatchObject({ code: 'INVALID_LABEL' });
  });

  it('отдаёт 404, если поддомена нет ни в кэше, ни в контракте', async () => {
    const response = await getSubdomain(
      get('/api/zones/.femboy/subdomains/blog'),
      labelContext('.femboy', 'blog'),
    );
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toMatchObject({ message: 'Поддомен не найден' });
  });

  it('берёт данные из кэша и добавляет события', async () => {
    state.subdomainCache = { id: 'row-1', name: 'blog.femboy', label: 'blog', status: 'active' };
    state.events = { items: [{ eventType: 'registered' }], total: 1, page: 1, limit: 20, pages: 1 };
    const response = await getSubdomain(
      get('/api/zones/.femboy/subdomains/blog'),
      labelContext('.femboy', 'blog'),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.subdomain).toMatchObject({ id: 'row-1', name: 'blog.femboy' });
    expect(body.chain).toBeNull();
    expect(body.events).toEqual([{ eventType: 'registered' }]);
  });

  it('работает, когда индексер ещё не догнал контракт', async () => {
    state.chainSubdomain = {
      owner: STRANGER,
      zoneOwner: ZONE_OWNER,
      registeredAt: PAST,
      expiresAt: FUTURE,
      updatedAt: PAST,
      blocked: false,
      metadata: '',
    };
    const response = await getSubdomain(
      get('/api/zones/.femboy/subdomains/blog'),
      labelContext('.femboy', 'blog'),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.subdomain).toMatchObject({ name: 'blog.femboy', ownerAddress: STRANGER, id: '' });
    expect(body.chain).toMatchObject({ name: 'blog.femboy' });
    expect(body.events).toEqual([]);
    expect(dbMock.listSubdomainEvents).not.toHaveBeenCalled();
  });
});

describe('POST /api/subdomains/prepare-registration', () => {
  const payload = {
    tld: '.femboy',
    label: 'blog',
    metadata: '{"url":"https://example.com"}',
    sender: ZONE_OWNER,
  };

  it('отвечает 501 без контракта', async () => {
    state.enabled = false;
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(501);
  });

  it.each([
    ['метка с двойным дефисом', { ...payload, label: 'a--b' }, 'LABEL_DOUBLE_HYPHEN'],
    [
      'метка с большой буквы и пробелом',
      { ...payload, label: 'my blog' },
      'LABEL_INVALID_CHARACTER',
    ],
    ['метка с дефисом по краю', { ...payload, label: '-blog' }, 'LABEL_HYPHEN_EDGE'],
    ['метка длиннее 32 символов', { ...payload, label: 'a'.repeat(33) }, 'LABEL_LENGTH'],
    ['слишком длинные метаданные', { ...payload, metadata: 'x'.repeat(513) }, null],
    ['не адрес отправителя', { ...payload, sender: '0x123' }, null],
  ])('отвергает некорректный ввод: %s', async (_name, body, issueCode) => {
    const response = await prepareRegistration(post('/api/subdomains/prepare-registration', body));
    expect(response.status).toBe(400);
    const error = (await bodyOf(response)).error as {
      code: string;
      details?: { issues?: Array<{ message: string }> };
    };
    expect(error.code).toBe('INVALID_INPUT');
    if (issueCode) {
      expect(error.details?.issues?.map((issue) => issue.message)).toContain(issueCode);
    }
    expect(state.calls.simulate).toHaveLength(0);
  });

  it('отвечает 404, если зоны нет в контракте', async () => {
    state.chainZone = null;
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'ZONE_NOT_FOUND' });
  });

  it('отвечает 409 для заблокированной зоны', async () => {
    state.chainZone = { owner: ZONE_OWNER, blocked: true, expiresAt: FUTURE };
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'ZONE_BLOCKED' });
  });

  it('отвечает 409 для истёкшей зоны', async () => {
    state.chainZone = { owner: ZONE_OWNER, blocked: false, expiresAt: PAST };
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'ZONE_EXPIRED' });
  });

  it('отвечает 403, когда поддомен создаёт не владелец зоны', async () => {
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', { ...payload, sender: STRANGER }),
    );
    expect(response.status).toBe(403);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'NOT_ZONE_OWNER' });
    expect(state.calls.simulate).toHaveLength(0);
  });

  it('отвечает 409, если поддомен уже занят', async () => {
    state.chainSubdomain = {
      owner: ZONE_OWNER,
      zoneOwner: ZONE_OWNER,
      registeredAt: PAST,
      expiresAt: FUTURE,
      updatedAt: PAST,
      blocked: false,
      metadata: '',
    };
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'SUBDOMAIN_TAKEN' });
    expect(state.calls.simulate).toHaveLength(0);
  });

  it('разрешает перерегистрацию заблокированного поддомена', async () => {
    state.chainSubdomain = {
      owner: ZONE_OWNER,
      zoneOwner: ZONE_OWNER,
      registeredAt: PAST,
      expiresAt: FUTURE,
      updatedAt: PAST,
      blocked: true,
      metadata: '',
    };
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(201);
  });

  it('возвращает неподписанную транзакцию и intent', async () => {
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(201);
    const body = await bodyOf(response);
    expect(body).toMatchObject({
      contract: '0xa6565Dc205b2Af794ff4582dB1A6438CDF922c35',
      chainId: 11155111,
      intentId: 'intent-1',
      tld: '.femboy',
      label: 'blog',
      name: 'blog.femboy',
      periodDays: 365,
    });
    expect((body.tx as { data: string }).data).toBe('0xMOCKregisterSubdomain');
    expect(state.calls.simulate[0]).toMatchObject({
      functionName: 'registerSubdomain',
      args: ['.femboy', 'blog', payload.metadata],
      account: ZONE_OWNER_LC,
    });
    expect(state.calls.intents[0]).toMatchObject({
      action: 'subdomain-register',
      tld: '.femboy',
      payload: { label: 'blog', metadata: payload.metadata },
    });
  });

  it('не создаёт intent, если контракт отверг вызов', async () => {
    state.simulateError = new ApiError(403, 'NotAuthorized', 'Not authorized');
    const response = await prepareRegistration(
      post('/api/subdomains/prepare-registration', payload),
    );
    expect(response.status).toBe(403);
    expect(state.calls.intents).toHaveLength(0);
  });
});

describe('POST /api/subdomains/prepare-transfer', () => {
  const payload = { tld: '.femboy', label: 'blog', to: STRANGER, sender: ZONE_OWNER };

  it('отвечает 404, если поддомена нет', async () => {
    const response = await prepareTransfer(post('/api/subdomains/prepare-transfer', payload));
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'SUBDOMAIN_NOT_FOUND' });
  });

  it('готовит транзакцию передачи', async () => {
    state.chainSubdomain = {
      owner: ZONE_OWNER,
      zoneOwner: ZONE_OWNER,
      registeredAt: PAST,
      expiresAt: FUTURE,
      updatedAt: PAST,
      blocked: false,
      metadata: '',
    };
    const response = await prepareTransfer(post('/api/subdomains/prepare-transfer', payload));
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).tx).toMatchObject({ data: '0xMOCKtransferSubdomain' });
    expect(state.calls.simulate[0]).toMatchObject({
      functionName: 'transferSubdomain',
      args: ['.femboy', 'blog', STRANGER],
    });
    expect(state.calls.intents[0]).toMatchObject({ action: 'subdomain-transfer' });
  });
});

describe('POST /api/subdomains/prepare-metadata и prepare-renewal', () => {
  const sender = ZONE_OWNER;

  it('метаданные: 501 без контракта', async () => {
    state.enabled = false;
    const response = await prepareMetadata(
      post('/api/subdomains/prepare-metadata', {
        tld: '.femboy',
        label: 'blog',
        metadata: '',
        sender,
      }),
    );
    expect(response.status).toBe(501);
  });

  it('метаданные: 201 и вызов контракта с новой строкой', async () => {
    const response = await prepareMetadata(
      post('/api/subdomains/prepare-metadata', {
        tld: '.femboy',
        label: 'blog',
        metadata: '{"url":"https://new.example"}',
        sender,
      }),
    );
    expect(response.status).toBe(201);
    expect(state.calls.simulate[0]).toMatchObject({
      functionName: 'setSubdomainMetadata',
      args: ['.femboy', 'blog', '{"url":"https://new.example"}'],
    });
    expect(state.calls.intents[0]).toMatchObject({ action: 'subdomain-metadata' });
  });

  it('продление: 201 и действие subdomain-renew', async () => {
    const response = await prepareRenewal(
      post('/api/subdomains/prepare-renewal', { tld: '.femboy', label: 'blog', sender }),
    );
    expect(response.status).toBe(201);
    expect(state.calls.simulate[0]).toMatchObject({
      functionName: 'renewSubdomain',
      args: ['.femboy', 'blog'],
    });
    expect(state.calls.intents[0]).toMatchObject({ action: 'subdomain-renew' });
  });

  it('продление: ошибка контракта SubdomainNotFound → 404 без intent', async () => {
    state.simulateError = new ApiError(404, 'SubdomainNotFound', 'Subdomain not found');
    const response = await prepareRenewal(
      post('/api/subdomains/prepare-renewal', { tld: '.femboy', label: 'blog', sender }),
    );
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'SubdomainNotFound' });
    expect(state.calls.intents).toHaveLength(0);
  });
});

describe('защита prepare-маршрутов', () => {
  it('отклоняет невалидный JSON (400 INVALID_JSON)', async () => {
    const request = new Request('http://localhost:3000/api/subdomains/prepare-registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const response = await prepareRegistration(request);
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toMatchObject({ code: 'INVALID_JSON' });
    expect(state.calls.simulate).toHaveLength(0);
  });

  it('отклоняет POST с чужого Origin (CSRF)', async () => {
    const response = await prepareRegistration(
      post(
        '/api/subdomains/prepare-registration',
        { tld: '.femboy', label: 'blog', sender: ZONE_OWNER },
        { origin: 'https://evil.example', host: 'localhost:3000' },
      ),
    );
    expect(response.status).toBe(403);
    expect(state.calls.simulate).toHaveLength(0);
  });

  it('отвечает 429 после исчерпания лимита записи', async () => {
    const send = () =>
      prepareRenewal(
        post(
          '/api/subdomains/prepare-renewal',
          { tld: '.femboy', label: 'blog', sender: ZONE_OWNER },
          { 'x-forwarded-for': '203.0.113.7' },
        ),
      );
    for (let i = 0; i < 30; i += 1) await send();
    const response = await send();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
  });
});
