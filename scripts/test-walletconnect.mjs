/**
 * Проверка подключения кошелька на телефоне (WalletConnect v2) в настоящем браузере.
 *
 * Сценарий повторяет мобильный Chrome: window.ethereum отсутствует, поэтому единственный
 * путь — кнопка «MetaMask на телефоне». Проверяем, что:
 *   1) в шапке на узком экране есть кнопка кошелька (иконка, без подписи);
 *   2) в меню есть пункт WalletConnect;
 *   3) модальное окно WalletConnect открывается и показывает QR-код для сопряжения;
 *   4) CSP не блокирует relay (wss://relay.walletconnect.org) и шрифты модалки.
 *
 * Запуск: сначала `npm run build && PORT=3200 npm start`, затем
 *   node scripts/test-walletconnect.mjs [http://127.0.0.1:3200]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3200';
const browser = await chromium.launch();
let failures = 0;

const cspViolations = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
page.on('console', (message) => {
  const text = message.text();
  if (/Content Security Policy/i.test(text)) cspViolations.push(text.slice(0, 160));
});

await page.goto(BASE, { waitUntil: 'load', timeout: 90_000 });
console.log('window.ethereum:', await page.evaluate(() => typeof window.ethereum));

const walletButtons = await page.locator('header button[aria-label="Connect wallet"]').count();
console.log(walletButtons ? '✅ кнопка кошелька видна на телефоне' : '❌ кнопки кошелька нет');
if (!walletButtons) failures += 1;

await page.setViewportSize({ width: 1280, height: 900 });
await page.click('header button:has-text("Connect wallet")');
await page.waitForSelector('text=MetaMask на телефоне', { timeout: 20_000 });
console.log('✅ пункт «MetaMask на телефоне» есть в меню');

const sockets = [];
page.on('websocket', (socket) => sockets.push(socket.url().split('?')[0]));
await page.click('text=MetaMask на телефоне');

let modal = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await page.waitForTimeout(1000);
  modal = await page.evaluate(() => Boolean(document.querySelector('wcm-modal, w3m-modal')));
  if (modal) break;
}
console.log(
  modal ? '✅ модальное окно WalletConnect открылось' : '❌ окно WalletConnect не появилось',
);
if (!modal) failures += 1;

await page.waitForTimeout(8000);
const qrPainted = await page.screenshot({ clip: { x: 460, y: 220, width: 360, height: 360 } });
const qrBytes = qrPainted.length;
console.log(
  qrBytes > 3000
    ? `✅ в области QR что-то отрисовано (${qrBytes} байт PNG)`
    : `⚠️ область QR почти пустая (${qrBytes} байт) — вероятно relay недоступен`,
);
console.log('websocket к relay:', sockets.length ? sockets.join(', ') : 'не создан');
console.log(
  cspViolations.length
    ? `❌ нарушения CSP: ${cspViolations[0]}`
    : '✅ CSP не блокирует WalletConnect',
);
if (cspViolations.length) failures += 1;

await page.screenshot({ path: 'docs/walletconnect-modal.png' });
await browser.close();

console.log(failures === 0 ? '\nВсе проверки пройдены.' : `\nПровалено проверок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
