// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { siteFilePathSchema } from '@justtld/shared';
import { hashPassword, verifyPassword } from '@/lib/server/accounts';
import { buildSafeFqdn } from '@/lib/server/cloudflare-dns';
import {
  verifyCryptoBotWebhookSignature,
  verifyYooMoneyNotificationSignature,
} from '@/lib/server/payments';

describe('V2: безопасность аккаунтов, файлов, DNS и платежей', () => {
  it('хеширует и проверяет пароль через scrypt', () => {
    const hash = hashPassword('super-secret-123');
    expect(hash.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword('super-secret-123', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('отклоняет небезопасные пути файлов (path traversal и Windows-слэши)', () => {
    expect(siteFilePathSchema.parse('/index.html')).toBe('index.html');
    expect(siteFilePathSchema.parse('assets/style.css')).toBe('assets/style.css');
    expect(() => siteFilePathSchema.parse('../etc/passwd')).toThrow();
    expect(() => siteFilePathSchema.parse('dir\\file.txt')).toThrow();
  });

  it('защищает системные имена в buildSafeFqdn для Cloudflare DNS', () => {
    process.env.RESOLVER_DOMAIN = 'justtld.online';
    expect(buildSafeFqdn('.myshop', '')).toBe('myshop.justtld.online');
    expect(buildSafeFqdn('.myshop', 'blog')).toBe('blog.myshop.justtld.online');
    expect(() => buildSafeFqdn('.www', '')).toThrow();
    expect(() => buildSafeFqdn('.api', '')).toThrow();
    expect(() => buildSafeFqdn('._acme-challenge', '')).toThrow();
    expect(() => buildSafeFqdn('.myshop', '_acme-challenge')).toThrow();
  });

  it('проверяет SHA-1 подпись HTTP-уведомлений ЮMoney', () => {
    process.env.YOOMONEY_SECRET = 'ym-test-secret';
    const fields = {
      notification_type: 'card-incoming',
      operation_id: 'op-12345',
      amount: '490.00',
      currency: '643',
      datetime: '2026-11-21T10:00:00Z',
      sender: '410010000000000',
      codepro: 'false',
      label: 'order-uuid-1',
    };
    const raw = [
      fields.notification_type,
      fields.operation_id,
      fields.amount,
      fields.currency,
      fields.datetime,
      fields.sender,
      fields.codepro,
      'ym-test-secret',
      fields.label,
    ].join('&');
    const sha1_hash = createHash('sha1').update(raw).digest('hex');

    expect(verifyYooMoneyNotificationSignature({ ...fields, sha1_hash })).toBe(true);
    expect(
      verifyYooMoneyNotificationSignature({
        ...fields,
        amount: '999.00',
        sha1_hash,
      }),
    ).toBe(false);
  });

  it('проверяет HMAC-SHA256 подпись вебхука @CryptoBot', () => {
    process.env.CRYPTOBOT_API_TOKEN = 'cb-token-xyz';
    const rawBody = JSON.stringify({
      update_type: 'invoice_paid',
      payload: { invoice_id: 42, payload: 'order-uuid-2' },
    });
    const secret = createHash('sha256').update('cb-token-xyz').digest();
    const sig = createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyCryptoBotWebhookSignature(rawBody, sig)).toBe(true);
    expect(verifyCryptoBotWebhookSignature(rawBody, '0'.repeat(64))).toBe(false);
  });
});
