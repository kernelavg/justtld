export * from './tld';
export * from './catalog-million';
export * from './types';
export * from './schemas';
export * from './format';
export * from './errors';
export * from './generated/registry';
export * from './generated/subdomains';

export const APP_NAME = 'JustTLD';
export const APP_TAGLINE_RU = 'Создай свою зону. Владей своим пространством.';
export const APP_TAGLINE_EN = 'Create your zone. Own your space.';
export const APP_VERSION = '1.0.0';

export const DEFAULT_CHAIN_ID = 31337;
export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

/** Типы событий контракта → строки в zone_events. */
export const CONTRACT_EVENT_TO_TYPE = {
  TLDRegistered: 'registered',
  TLDTransferred: 'transferred',
  TLDRenewed: 'renewed',
  TLDMetadataUpdated: 'metadata_updated',
  TLDBlocked: 'blocked',
  TLDUnblocked: 'unblocked',
} as const;

export type ContractEventName = keyof typeof CONTRACT_EVENT_TO_TYPE;

export const CONTRACT_EVENT_NAMES = Object.keys(CONTRACT_EVENT_TO_TYPE) as ContractEventName[];

/** Типы событий контракта поддоменов → строки в subdomain_events. */
export const SUBDOMAIN_EVENT_TO_TYPE = {
  SubdomainRegistered: 'registered',
  SubdomainTransferred: 'transferred',
  SubdomainRenewed: 'renewed',
  SubdomainMetadataUpdated: 'metadata_updated',
  SubdomainBlocked: 'blocked',
  SubdomainUnblocked: 'unblocked',
} as const;

export type SubdomainContractEventName = keyof typeof SUBDOMAIN_EVENT_TO_TYPE;

export const SUBDOMAIN_EVENT_NAMES = Object.keys(
  SUBDOMAIN_EVENT_TO_TYPE,
) as SubdomainContractEventName[];
