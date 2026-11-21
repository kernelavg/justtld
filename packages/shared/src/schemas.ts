import { z } from 'zod';
import { METADATA_MAX_LENGTH, normalizeTld, validateTldFormat } from './tld';

const hex40 = /^0x[0-9a-fA-F]{40}$/;
const hex32 = /^0x[0-9a-fA-F]{64}$/;

/** Адрес EVM-кошелька (нормализуется в lower-case). */
export const addressSchema = z
  .string()
  .trim()
  .regex(hex40, 'ADDRESS_INVALID')
  .transform((value) => value.toLowerCase());

export const txHashSchema = z.string().trim().regex(hex32, 'TX_HASH_INVALID');

/** TLD-зона: нормализуется (точка, lower-case) и проверяется по правилам контракта. */
export const tldSchema = z
  .string()
  .min(1, 'TLD_EMPTY')
  .max(64, 'TLD_LENGTH')
  .transform(normalizeTld)
  .superRefine((value, ctx) => {
    const result = validateTldFormat(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.code ?? 'TLD_INVALID' });
    }
  });

export const metadataSchema = z.string().max(METADATA_MAX_LENGTH, 'METADATA_TOO_LONG').default('');

export const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
export const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const zoneStatusFilterSchema = z
  .enum(['all', 'active', 'expired', 'blocked'])
  .default('all');
export const zoneSortSchema = z.enum(['newest', 'oldest', 'tld', 'expires_soon']).default('newest');
export const eventTypeSchema = z.enum([
  'registered',
  'transferred',
  'renewed',
  'metadata_updated',
  'blocked',
  'unblocked',
]);

export const zonesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  status: zoneStatusFilterSchema,
  owner: addressSchema.optional(),
  q: z.string().trim().max(64).optional(),
  sort: zoneSortSchema,
});

export const subdomainsQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  status: zoneStatusFilterSchema,
  tld: z
    .string()
    .trim()
    .max(64)
    .transform(normalizeTld)
    .optional(),
  owner: addressSchema.optional(),
  scope: z.enum(['any', 'owner', 'zone_owner']).default('any'),
  q: z.string().trim().max(64).optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'expires_soon']).default('newest'),
});

export const historyQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  type: eventTypeSchema.optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'QUERY_EMPTY').max(64, 'QUERY_TOO_LONG'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const prepareRegistrationSchema = z.object({
  tld: tldSchema,
  metadata: metadataSchema.optional().default(''),
  sender: addressSchema,
});

/** Метка поддомена: 1–32 символа, a-z/0-9/-, без дефисов по краям и без `--`. */
export const subdomainLabelSchema = z
  .string()
  .trim()
  .min(1, 'LABEL_EMPTY')
  .max(32, 'LABEL_LENGTH')
  .regex(/^[A-Za-z0-9-]+$/, 'LABEL_INVALID_CHARACTER')
  .refine((value) => !value.startsWith('-') && !value.endsWith('-'), 'LABEL_HYPHEN_EDGE')
  .refine((value) => !value.includes('--'), 'LABEL_DOUBLE_HYPHEN');

export const prepareSubdomainRegistrationSchema = z.object({
  tld: tldSchema,
  label: subdomainLabelSchema,
  metadata: metadataSchema.optional().default(''),
  sender: addressSchema,
});

export const prepareSubdomainTransferSchema = z.object({
  tld: tldSchema,
  label: subdomainLabelSchema,
  to: addressSchema,
  sender: addressSchema,
});

export const prepareSubdomainMetadataSchema = z.object({
  tld: tldSchema,
  label: subdomainLabelSchema,
  metadata: metadataSchema,
  sender: addressSchema,
});

export const prepareSubdomainRenewalSchema = z.object({
  tld: tldSchema,
  label: subdomainLabelSchema,
  sender: addressSchema,
});

export const prepareTransferSchema = z.object({
  tld: tldSchema,
  to: addressSchema,
  sender: addressSchema,
});

export const prepareRenewalSchema = z.object({
  tld: tldSchema,
  sender: addressSchema,
});

export const prepareMetadataSchema = z.object({
  tld: tldSchema,
  metadata: metadataSchema,
  sender: addressSchema,
});

export const blockZoneSchema = z.object({
  reason: z.string().trim().min(1, 'REASON_EMPTY').max(256, 'REASON_TOO_LONG'),
});

export const adminListSchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export const blacklistWordSchema = z.object({
  word: z
    .string()
    .trim()
    .min(2, 'WORD_TOO_SHORT')
    .max(32, 'WORD_TOO_LONG')
    .regex(/^[a-zA-Z0-9-]+$/, 'WORD_INVALID')
    .transform((value) => value.toLowerCase()),
});

export const reservedTldSchema = z.object({ tld: tldSchema });

export const authNonceSchema = z.object({ address: addressSchema });

export const authVerifySchema = z.object({
  address: addressSchema,
  signature: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{130}$/, 'SIGNATURE_INVALID'),
  nonce: z.string().trim().min(8).max(128),
});

export const confirmTxSchema = z.object({
  intentId: z.string().uuid().optional(),
  transactionHash: txHashSchema,
});

/* ───────────── Магазин, аккаунты, хостинг сайтов, DNS ───────────── */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('EMAIL_INVALID')
  .max(160, 'EMAIL_TOO_LONG');

export const accountRegisterSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'PASSWORD_TOO_SHORT').max(128, 'PASSWORD_TOO_LONG'),
  displayName: z.string().trim().max(64).optional(),
});

export const accountLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'PASSWORD_EMPTY').max(128),
});

export const storeListingCreateSchema = z.object({
  tld: tldSchema,
  subLabel: z
    .string()
    .trim()
    .toLowerCase()
    .max(32)
    .refine((v) => v === '' || /^[a-z0-9-]+$/.test(v), 'LABEL_INVALID')
    .default(''),
  title: z.string().trim().min(1, 'TITLE_EMPTY').max(120),
  description: z.string().trim().max(500).default(''),
  priceRub: z.coerce.number().min(1).max(1_000_000),
  priceUsdt: z.coerce.number().min(0.1).max(100_000),
  periodDays: z.coerce.number().int().min(30).max(3650).default(365),
  status: z.enum(['available', 'sold', 'hidden']).default('available'),
});

export const storePricingSchema = z.object({
  customZoneEnabled: z.boolean(),
  customZonePriceRub: z.coerce.number().min(1).max(1_000_000),
  customZonePriceUsdt: z.coerce.number().min(0.1).max(100_000),
  customSubdomainEnabled: z.boolean(),
  customSubdomainPriceRub: z.coerce.number().min(1).max(1_000_000),
  customSubdomainPriceUsdt: z.coerce.number().min(0.1).max(100_000),
});

export const createOrderSchema = z.object({
  kind: z.enum(['listing', 'custom_zone', 'custom_subdomain']),
  listingId: z.string().uuid().optional(),
  tld: tldSchema.optional(),
  subLabel: z
    .string()
    .trim()
    .toLowerCase()
    .max(32)
    .optional()
    .default(''),
  provider: z.enum(['yoomoney', 'cryptobot', 'sandbox']),
  currency: z.enum(['RUB', 'USDT', 'TON', 'BTC', 'ETH']).default('RUB'),
  buyerEmail: emailSchema.optional(),
});

export const optionalSubLabelSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(32)
  .refine(
    (v) =>
      v === '' ||
      (/^[a-z0-9-]+$/.test(v) && !v.startsWith('-') && !v.endsWith('-') && !v.includes('--')),
    'LABEL_INVALID',
  )
  .default('');

export const siteFilePathSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\/+/, '').replace(/\/{2,}/g, '/'))
  .refine((value) => value.length >= 1 && value.length <= 160, 'PATH_LENGTH')
  .refine(
    (value) =>
      !value.includes('..') &&
      !value.includes('\\') &&
      /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*$/.test(value),
    'PATH_INVALID',
  );

export const siteSettingsSchema = z.object({
  tld: tldSchema,
  subLabel: optionalSubLabelSchema,
  mode: z.enum(['redirect', 'hosting', 'card']),
  entryFile: siteFilePathSchema.default('index.html'),
  spaFallback: z.boolean().default(false),
});

export const siteFilePutSchema = z.object({
  tld: tldSchema,
  subLabel: optionalSubLabelSchema,
  path: siteFilePathSchema,
  content: z.string().max(2_800_000, 'FILE_TOO_LARGE'),
  isBase64: z.boolean().default(false),
  mimeType: z.string().trim().max(120).optional(),
});

export const dnsRecordCreateSchema = z.object({
  tld: tldSchema,
  subLabel: optionalSubLabelSchema,
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
  content: z.string().trim().min(1, 'DNS_CONTENT_EMPTY').max(512),
  ttl: z.coerce.number().int().min(60).max(86400).default(120),
  priority: z.coerce.number().int().min(0).max(65535).nullable().optional(),
});

export type ZonesQuery = z.infer<typeof zonesQuerySchema>;
export type SubdomainsQuery = z.infer<typeof subdomainsQuerySchema>;
export type PrepareRegistrationInput = z.infer<typeof prepareRegistrationSchema>;
export type PrepareSubdomainRegistrationInput = z.infer<typeof prepareSubdomainRegistrationSchema>;
export type PrepareSubdomainTransferInput = z.infer<typeof prepareSubdomainTransferSchema>;
export type PrepareSubdomainMetadataInput = z.infer<typeof prepareSubdomainMetadataSchema>;
export type PrepareSubdomainRenewalInput = z.infer<typeof prepareSubdomainRenewalSchema>;
export type PrepareTransferInput = z.infer<typeof prepareTransferSchema>;
export type PrepareRenewalInput = z.infer<typeof prepareRenewalSchema>;
export type PrepareMetadataInput = z.infer<typeof prepareMetadataSchema>;
