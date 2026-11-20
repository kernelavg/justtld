/**
 * Проверка второго режима страницы public/static-dapp.html — вход по приватному ключу
 * без кошелька в браузере (window.ethereum отсутствует, как в обычном Chrome на телефоне).
 *
 * Транзакции подписываются локально (viem privateKeyToAccount) и уходят в реальную Sepolia.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { createPublicClient, http as viemHttp, parseAbi } from 'viem';

const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const PORT = 4598;
const PAGE_FILE = path.join(path.resolve('.'), 'public/static-dapp.html');
const contract = '0x040e0F550dE73Aa796131A3C503B0189303CB298';

const secrets = fs.readFileSync(path.resolve('.env.secrets'), 'utf8');
const key = /DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/.exec(secrets)?.[1];
if (!key) throw new Error('нет DEPLOYER_PRIVATE_KEY');
const expected = '0x2ba51777889785cc53871463bf8e4db95fc8d886';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(PAGE_FILE));
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__JUSTTLD__), { timeout: 30_000 });

const hasEthereum = await page.evaluate(() => typeof window.ethereum);
console.log('window.ethereum в браузере:', hasEthereum, '(ожидается undefined)');

// 1. клик «Подключить» без кошелька открывает форму ключа
await page.click('#connect');
await page.waitForSelector('#localkey:not(.hidden)', { timeout: 10_000 });
console.log('✅ панель «Войти по ключу» открылась сама');

// 2. неверный ключ отклоняется
await page.fill('#privkey', '0x1234');
await page.click('#login-key');
console.log('✅ неверный ключ:', (await page.textContent('#status')).trim());

// 3. реальный ключ burner'а
await page.fill('#privkey', key);
await page.click('#login-key');
await page.waitForFunction(
  () => document.getElementById('wallet').textContent.includes('подпись в браузере'),
  { timeout: 30_000 },
);
const walletText = (await page.textContent('#wallet')).trim();
console.log('✅ вход по ключу:', walletText);
if (!walletText.includes(expected)) throw new Error('адрес не совпал');
if ((await page.inputValue('#privkey')) !== '') throw new Error('ключ остался в поле ввода');
console.log('✅ поле ключа очищено после входа');

// 4. баланс подтянулся
await page.waitForFunction(
  () => document.getElementById('balance-line').textContent.includes('ETH'),
  { timeout: 30_000 },
);
console.log('✅', (await page.textContent('#balance-line')).trim());

// 5. регистрация новой зоны локальной подписью
const tld = `.local-${Math.random().toString(36).slice(2, 7)}`;
await page.fill('#tld', tld);
await page.waitForFunction(
  () => document.getElementById('availability').textContent.includes('свободна'),
  { timeout: 30_000 },
);
await page.click('#register');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Готово'), {
  timeout: 120_000,
});
console.log('✅ регистрация:', (await page.textContent('#status')).trim());

// 6. независимая проверка в сети
const publicClient = createPublicClient({ transport: viemHttp(RPC) });
const owner = await publicClient.readContract({
  address: contract,
  abi: parseAbi(['function ownerOf(string tld) view returns (address)']),
  functionName: 'ownerOf',
  args: [tld],
});
console.log('✅ ownerOf из сети:', owner);
if (owner.toLowerCase() !== expected) throw new Error('владелец не совпал');

await page.waitForFunction(
  (name) => document.getElementById('zones').textContent.includes(name),
  tld,
  { timeout: 30_000 },
);
console.log('✅ зона в списке «Мои зоны»');

await page.screenshot({ path: 'docs/static-dapp-local.png', fullPage: true });
await browser.close();
server.close();

if (errors.length) console.log('⚠️ ошибки JS на странице:', errors.slice(0, 5));
console.log('\nРежим «без кошелька» работает. Зона:', tld);
console.log('Скриншот: docs/static-dapp-local.png');
