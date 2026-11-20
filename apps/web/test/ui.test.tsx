import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ZoneDto } from '@justtld/shared';
import { I18nProvider } from '@/lib/i18n';

/* ───────────────────────── моки окружения ───────────────────────── */

const searchZonesMock = vi.fn();
const prepareRegistrationMock = vi.fn();
const runMock = vi.fn();

vi.mock('@/lib/api', () => ({
  searchZones: (...args: unknown[]) => searchZonesMock(...args),
  prepareRegistration: (...args: unknown[]) => prepareRegistrationMock(...args),
  prepareTransfer: vi.fn(),
  prepareRenewal: vi.fn(),
  prepareMetadata: vi.fn(),
  confirmTx: vi.fn(),
}));

vi.mock('@/lib/wallet', () => ({
  useWallet: () => ({
    status: 'connected',
    address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    kind: 'dev',
    label: 'Hardhat #1',
    chainId: 31337,
    error: null,
    publicClient: {},
    hasInjected: false,
    connectInjected: vi.fn(),
    connectDev: vi.fn(),
    disconnect: vi.fn(),
    sendTransaction: vi.fn(),
    signMessage: vi.fn(),
    ensureChain: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks')>('@/lib/hooks');
  return {
    ...actual,
    useTxFlow: () => ({
      state: { phase: 'idle', hash: null, error: null, result: null },
      run: runMock,
      reset: vi.fn(),
    }),
  };
});

/* Импортируем компоненты ПОСЛЕ объявления моков. */
const { ZoneCard } = await import('@/components/zones/zone-card');
const { ZoneStatusBadge } = await import('@/components/zones/status-badge');
const { TxStatus } = await import('@/components/tx/tx-status');
const { RegisterForm, describeReason } = await import('@/components/zones/register-form');

const zone: ZoneDto = {
  id: '11111111-1111-1111-1111-111111111111',
  tld: '.myzone',
  ownerAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  status: 'active',
  registeredAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  metadata: '{"site":"https://my.zone"}',
  transactionHash: `0x${'a'.repeat(64)}`,
  blockNumber: 12,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderWithProviders(ui: React.ReactElement) {
  // язык по умолчанию для тестов — русский (иначе jsdom отдаёт navigator.language = en-US)
  window.localStorage.setItem('justtld.language', 'ru');
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  searchZonesMock.mockResolvedValue({
    query: '.myzone',
    results: [],
    availability: { tld: '.myzone', available: true, reason: '' },
  });
  runMock.mockResolvedValue({ status: 'confirmed', transactionHash: `0x${'b'.repeat(64)}` });
});

afterEach(() => {
  cleanup();
});

describe('UI: карточка зоны и статусы', () => {
  it('показывает TLD, владельца и статус активной зоны', () => {
    renderWithProviders(<ZoneCard zone={zone} />);
    expect(screen.getByText('.myzone')).toBeInTheDocument();
    expect(screen.getByText('0x70997…c79c8')).toBeInTheDocument();
    expect(screen.getByText('Активна')).toBeInTheDocument();
    expect(screen.getByText(/my\.zone/)).toBeInTheDocument();
  });

  it('отображает статусы blocked и expired разными бейджами', () => {
    const { container, rerender } = renderWithProviders(<ZoneStatusBadge status="blocked" />);
    expect(screen.getByText('Заблокирована')).toBeInTheDocument();
    expect(container.querySelector('.text-destructive')).not.toBeNull();

    rerender(
      <I18nProvider>
        <ZoneStatusBadge status="expired" />
      </I18nProvider>,
    );
    expect(screen.getByText('Истекла')).toBeInTheDocument();
  });
});

describe('UI: статус транзакции', () => {
  it('показывает подтверждение с номером блока и ссылкой на обозреватель', () => {
    renderWithProviders(
      <TxStatus
        state={{
          phase: 'confirmed',
          hash: `0x${'c'.repeat(64)}`,
          error: null,
          result: {
            status: 'confirmed',
            transactionHash: `0x${'c'.repeat(64)}`,
            blockNumber: 42,
            gasUsed: '183276',
          },
        }}
      />,
    );
    expect(screen.getByText('Транзакция подтверждена')).toBeInTheDocument();
    expect(screen.getByText(/Блок #42/)).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('/tx/0x');
  });

  it('показывает ошибку при отклонённой транзакции', () => {
    renderWithProviders(
      <TxStatus state={{ phase: 'failed', hash: null, error: 'REJECTED', result: null }} />,
    );
    expect(screen.getByText('Транзакция не выполнена')).toBeInTheDocument();
    expect(screen.getByText('Вы отклонили транзакцию в кошельке')).toBeInTheDocument();
  });

  it('показывает ожидание подтверждения', () => {
    renderWithProviders(
      <TxStatus
        state={{ phase: 'pending', hash: `0x${'d'.repeat(64)}`, error: null, result: null }}
      />,
    );
    expect(screen.getByText('Ожидание подтверждения')).toBeInTheDocument();
    expect(screen.getByText('Ждём включения в блок…')).toBeInTheDocument();
  });
});

describe('UI: форма регистрации', () => {
  it('блокирует отправку и объясняет ошибку при невалидной зоне', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    const input = screen.getByLabelText('Желаемая зона');
    await user.type(input, '.my_zone');

    await waitFor(() => {
      expect(screen.getByText(/Разрешены только латинские буквы/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Зарегистрировать за gas' })).toBeDisabled();
    expect(searchZonesMock).not.toHaveBeenCalled();
  });

  it('показывает доступность свободной зоны и отправляет подготовку транзакции', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    const input = screen.getByLabelText('Желаемая зона');
    await user.type(input, 'myzone');

    await waitFor(() => {
      expect(screen.getByText('Зона свободна')).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: 'Зарегистрировать за gas' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));
    // prepare-колбэк передаётся в run и должен вызвать серверный prepare-registration.
    const prepareCallback = runMock.mock.calls[0]?.[0] as () => Promise<unknown>;
    await prepareCallback();
    expect(prepareRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tld: '.myzone',
        sender: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      }),
    );
  });

  it('показывает причину недоступности занятой зоны', async () => {
    searchZonesMock.mockResolvedValue({
      query: '.taken',
      results: [],
      availability: { tld: '.taken', available: false, reason: 'TLD_ALREADY_EXISTS' },
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText('Желаемая зона'), '.taken');
    await waitFor(() => {
      expect(screen.getByText('Зона уже зарегистрирована')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Зарегистрировать за gas' })).toBeDisabled();
  });
});

describe('UI: локализация сообщений', () => {
  it('переводит коды причин на русский и английский', () => {
    expect(describeReason('TLD_RESERVED', 'ru')).toBe('Зона зарезервирована системой');
    expect(describeReason('TLD_RESERVED', 'en')).toBe('Zone is reserved by the system');
    expect(describeReason('TLD_LENGTH', 'en')).toContain('3–21');
    expect(describeReason('CUSTOM_CODE', 'ru')).toBe('CUSTOM_CODE');
  });
});
