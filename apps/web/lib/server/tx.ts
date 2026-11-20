import { BaseError, ContractFunctionRevertedError, encodeFunctionData, type Abi } from 'viem';
import { REGISTRY_ABI } from '@justtld/shared/generated/registry';
import { ApiError, type UnsignedTx } from '@justtld/shared';
import { chainId, registryAddress } from './config';
import { getPublicClient } from './chain';

export type RegistryFunction =
  | 'registerTLD'
  | 'transferTLD'
  | 'renewTLD'
  | 'setTLDMetadata'
  | 'blockTLD'
  | 'unblockTLD'
  | 'pause'
  | 'unpause'
  | 'addBlacklistedWord'
  | 'removeBlacklistedWord'
  | 'addReservedTLD'
  | 'removeReservedTLD'
  | 'transferOwnership';

/** Кодирует вызов контракта в неподписанную транзакцию. */
export function buildUnsignedTx(params: {
  functionName: RegistryFunction;
  args?: readonly unknown[];
  sender: string;
}): UnsignedTx {
  const data = encodeFunctionData({
    abi: REGISTRY_ABI as unknown as Abi,
    functionName: params.functionName,
    args: (params.args ?? []) as unknown[],
  });
  return {
    to: registryAddress(),
    data,
    value: '0',
    chainId: chainId(),
    from: params.sender.toLowerCase(),
  };
}

const CUSTOM_ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  TLDAlreadyExists: { code: 'TLD_TAKEN', message: 'Зона уже зарегистрирована', status: 409 },
  TLDReserved: { code: 'TLD_RESERVED', message: 'Зона зарезервирована', status: 409 },
  TLDBlacklisted: { code: 'TLD_BLACKLISTED', message: 'Название запрещено политикой', status: 409 },
  TLDNotFound: { code: 'ZONE_NOT_FOUND', message: 'Зона не найдена', status: 404 },
  NotTLDOwner: { code: 'NOT_ZONE_OWNER', message: 'Вы не владелец зоны', status: 403 },
  TLDIsBlocked: { code: 'ZONE_BLOCKED', message: 'Зона заблокирована', status: 409 },
  TLDNotBlocked: { code: 'ZONE_NOT_BLOCKED', message: 'Зона не заблокирована', status: 409 },
  EnforcedPause: { code: 'CONTRACT_PAUSED', message: 'Реестр на паузе', status: 409 },
  InvalidTLD: { code: 'INVALID_TLD', message: 'Некорректная зона', status: 400 },
  InvalidNewOwner: {
    code: 'INVALID_NEW_OWNER',
    message: 'Некорректный новый владелец',
    status: 400,
  },
  ZeroAddress: { code: 'ZERO_ADDRESS', message: 'Нулевой адрес недопустим', status: 400 },
  MetadataTooLong: {
    code: 'METADATA_TOO_LONG',
    message: 'Метаданные слишком длинные',
    status: 400,
  },
  InvalidReason: {
    code: 'INVALID_REASON',
    message: 'Некорректная причина блокировки',
    status: 400,
  },
  OwnableUnauthorizedAccount: {
    code: 'FORBIDDEN',
    message: 'Вызывающий не является owner контракта',
    status: 403,
  },
};

/** Извлекает имя custom error из любой формы ошибки viem. */
export function extractRevertName(error: unknown): string | null {
  if (error instanceof BaseError) {
    const revert = error.walk(
      (inner) => inner instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    const errorName = revert?.data?.errorName;
    if (errorName) return errorName;
  }
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
      : String(error);
  for (const name of Object.keys(CUSTOM_ERROR_MAP)) {
    if (message.includes(name)) return name;
  }
  return null;
}

/** Преобразует revert контракта в понятную ошибку API. */
export function mapContractError(error: unknown): ApiError {
  const name = extractRevertName(error);
  if (name) {
    const mapped = CUSTOM_ERROR_MAP[name];
    if (mapped) {
      return new ApiError(mapped.status, mapped.code, mapped.message, { revert: name });
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(502, 'CHAIN_CALL_FAILED', 'Вызов контракта не удался', {
    reason: message.split('\n')[0]?.slice(0, 300),
  });
}

/**
 * Предварительная симуляция вызова от имени пользователя.
 * Приложение не подписывает транзакции — но обязано заранее показать причину отказа.
 */
export async function simulateRegistryCall(params: {
  functionName: RegistryFunction;
  args?: readonly unknown[];
  account: `0x${string}`;
}): Promise<void> {
  try {
    await getPublicClient().simulateContract({
      address: registryAddress(),
      abi: REGISTRY_ABI as unknown as Abi,
      functionName: params.functionName,
      args: (params.args ?? []) as unknown[],
      account: params.account,
    });
  } catch (error) {
    throw mapContractError(error);
  }
}
