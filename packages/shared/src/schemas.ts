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

export type ZonesQuery = z.infer<typeof zonesQuerySchema>;
export type PrepareRegistrationInput = z.infer<typeof prepareRegistrationSchema>;
export type PrepareTransferInput = z.infer<typeof prepareTransferSchema>;
export type PrepareRenewalInput = z.infer<typeof prepareRenewalSchema>;
export type PrepareMetadataInput = z.infer<typeof prepareMetadataSchema>;
