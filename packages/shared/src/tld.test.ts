import { describe, expect, it } from 'vitest';
import {
  BUILTIN_RESERVED_TLDS,
  describeContractReason,
  describeTldIssue,
  isReservedTld,
  normalizeTld,
  validateTld,
  validateTldFormat,
} from './tld';
import { addressSchema, metadataSchema, prepareRegistrationSchema, tldSchema } from './schemas';

describe('normalizeTld', () => {
  it('добавляет точку и приводит к нижнему регистру', () => {
    expect(normalizeTld('MyZone')).toBe('.myzone');
    expect(normalizeTld('.MyZone')).toBe('.myzone');
    expect(normalizeTld('  .MY-ZONE ')).toBe('.my-zone');
    expect(normalizeTld('')).toBe('');
  });
});

describe('validateTldFormat', () => {
  it('принимает корректные зоны', () => {
    for (const tld of ['.myzone', '.web3', '.a1b', '.my-zone-2', '.xyz9']) {
      const result = validateTldFormat(tld);
      expect(result.ok, tld).toBe(true);
      expect(result.code).toBeNull();
    }
  });

  it('проверяет минимальную и максимальную длину', () => {
    expect(validateTldFormat('.a').code).toBe('TLD_LENGTH');
    expect(validateTldFormat('.ab').ok).toBe(true); // 3 символа вместе с точкой
    expect(validateTldFormat(`.${'a'.repeat(20)}`).ok).toBe(true); // 21 символ
    expect(validateTldFormat(`.${'a'.repeat(21)}`).code).toBe('TLD_LENGTH'); // 22
  });

  it('требует точку в начале', () => {
    expect(validateTldFormat('myzone').ok).toBe(true); // normalizeTld добавляет точку
    expect(validateTldFormat('...').code).toBe('TLD_EMPTY'); // после нормализации остаётся одна точка
    expect(validateTldFormat('').code).toBe('TLD_EMPTY');
  });

  it('запрещает недопустимые символы', () => {
    expect(validateTldFormat('.my_zone').code).toBe('TLD_INVALID_CHARACTER');
    expect(validateTldFormat('.зона').code).toBe('TLD_INVALID_CHARACTER');
    expect(validateTldFormat('.zone!').code).toBe('TLD_INVALID_CHARACTER');
    // пробелы вычищаются нормализацией (ввод из адресной строки)
    expect(validateTldFormat('.my zone')).toMatchObject({ ok: true, value: '.myzone' });
  });

  it('запрещает дефисы по краям и двойные дефисы', () => {
    expect(validateTldFormat('.-myzone').code).toBe('TLD_HYPHEN_EDGE');
    expect(validateTldFormat('.myzone-').code).toBe('TLD_HYPHEN_EDGE');
    expect(validateTldFormat('.my--zone').code).toBe('TLD_DOUBLE_HYPHEN');
  });
});

describe('резервы и сообщения', () => {
  it('распознаёт встроенные резервы', () => {
    for (const tld of BUILTIN_RESERVED_TLDS) {
      expect(isReservedTld(tld)).toBe(true);
      const result = validateTld(tld);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('TLD_RESERVED');
    }
    expect(isReservedTld('.myzone')).toBe(false);
  });

  it('отдаёт локализованные сообщения', () => {
    expect(describeTldIssue('TLD_LENGTH', 'ru')).toContain('3 до 21');
    expect(describeTldIssue('TLD_LENGTH', 'en')).toContain('3 and 21');
    expect(describeContractReason('TLD_LENGTH', 'ru')).toContain('3 до 21');
    expect(describeContractReason('NotTLDOwner', 'ru')).toContain('владелец');
    expect(describeTldIssue('NOPE', 'en')).toContain('Unknown');
  });
});

describe('zod-схемы', () => {
  it('нормализует адрес', () => {
    expect(addressSchema.parse('0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266')).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    );
    expect(() => addressSchema.parse('0x123')).toThrow();
  });

  it('валидирует TLD и возвращает нормализованное значение', () => {
    expect(tldSchema.parse('MyZone')).toBe('.myzone');
    expect(() => tldSchema.parse('.a')).toThrow();
    expect(() => tldSchema.parse('.my_zone')).toThrow();
  });

  it('ограничивает длину метаданных', () => {
    expect(metadataSchema.parse('x'.repeat(512))).toHaveLength(512);
    expect(() => metadataSchema.parse('x'.repeat(513))).toThrow();
  });

  it('проверяет payload регистрации', () => {
    const parsed = prepareRegistrationSchema.parse({
      tld: '.MyZone',
      sender: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });
    expect(parsed.tld).toBe('.myzone');
    expect(parsed.metadata).toBe('');
    expect(parsed.sender).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
  });
});
