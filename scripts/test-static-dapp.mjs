/**
 * Проверка статической страницы public/static-dapp.html в реальном браузере
 * против реальной сети Sepolia.
 *
 * window.ethereum эмулируется EIP-1193-провайдером, который подписывает
 * транзакции ключом burner'а из .env.secrets (то есть повторяет поведение MetaMask).
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { createPublicClient, http as viemHttp, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const PORT = 4599;
const ROOT = path.resolve('.');
const PAGE_FILE = path.join(ROOT, 'public/static-dapp.html');

const secrets = fs.readFileSync(path.resolve('.env.secrets'), 'utf8');
const key = /DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/.exec(secrets)?.[1];
if (!key) throw new Error('нет DEPLOYER_PRIVATE_KEY');
const account = privateKeyToAccount(key);
const contract = '0x040e0F550dE73Aa796131A3C503B0189303CB298';

let requestId = 0;
async function rpcCall(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

// ── локальный статический сервер ────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/' || url.pathname === '/static-dapp.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(PAGE_FILE));
    return;
  }
  res.writeHead(404).end('not found');
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

// ── EIP-1193 провайдер, который подписывает как MetaMask ────────────────────
const mockProviderSource = `
  window.__JUSTTLD_TEST_PROVIDER__ = (() => {
    const listeners = {};
    const emit = (event, payload) => (listeners[event] || []).forEach((fn) => fn(payload));
    return {
      isMetaMask: true,
      on(event, handler) { (listeners[event] = listeners[event] || []).push(handler); },
      async request({ method, params }) {
        const send = async (m, p) => {
          const res = await fetch('${RPC}', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() + Math.floor(Math.random() * 1000), method: m, params: p }),
          });
          const json = await res.json();
          if (json.error) { const e = new Error(json.error.message); e.code = json.error.code; e.data = json.error; throw e; }
          return json.result;
        };
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${account.address}'];
        if (method === 'eth_chainId') return '0xaa36a7';
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        if (method === 'eth_sendTransaction') {
          const tx = params[0];
          const nonce = await send('eth_getTransactionCount', [tx.from, 'pending']);
          let gas = tx.gas;
          if (!gas) {
            try {
              gas = await send('eth_estimateGas', [{ from: tx.from, to: tx.to, data: tx.data, value: tx.value || '0x0' }]);
            } catch (error) {
              gas = '0x4c4b40'; // 5 000 000 — как делает кошелёк, дальше решит EVM
            }
          }
          const signed = await window.__SIGN__({ ...tx, nonce, gas, chainId: 11155111 });
          return send('eth_sendRawTransaction', [signed]);
        }
        return send(method, params);
      },
    };
  })();
`;

const browser = await chromium.launch();
const page = await browser.newPage();

const signed = [];
await page.exposeFunction('__signTx__', async (tx) => {
  const gasPrice = BigInt(await rpcCall('eth_gasPrice', []));
  const signedTx = await account.signTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value ?? 0),
    nonce: Number(BigInt(tx.nonce)),
    gas: BigInt(tx.gas),
    chainId: 11155111,
    maxFeePerGas: gasPrice * 3n,
    maxPriorityFeePerGas: gasPrice,
  });
  signed.push(signedTx);
  return signedTx;
});
await page.addInitScript(`window.__SIGN__ = (tx) => window.__signTx__(tx);`);
await page.addInitScript(mockProviderSource);

const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(`http://127.0.0.1:${PORT}/static-dapp.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__JUSTTLD__), { timeout: 30_000 });

// 1. кошелёк подключается
await page.waitForFunction(() => document.getElementById('wallet').textContent.includes('0x'), {
  timeout: 30_000,
});
const walletText = (await page.textContent('#wallet')).trim();
console.log('✅ кошелёк подключён:', walletText);
if (walletText.toLowerCase() !== account.address.toLowerCase()) throw new Error('адрес не совпал');

// 2. валидация имён через публичный API страницы
const checks = await page.evaluate(() => {
  const v = window.__JUSTTLD__.validateTld;
  return {
    good: v('myzone').ok,
    dot: v('.my-zone').tld,
    short: v('.a').ok,
    symbol: v('.my_zone').ok,
    doubleHyphen: v('.my--zone').ok,
    trailingHyphen: v('.zone-').ok,
  };
});
console.log('✅ валидация:', checks);
if (
  !checks.good ||
  checks.dot !== '.my-zone' ||
  checks.short ||
  checks.symbol ||
  checks.doubleHyphen ||
  checks.trailingHyphen
) {
  throw new Error('валидация работает некорректно');
}

// 3. проверка доступности и регистрация реальной зоны
const tld = `.static-${Math.random().toString(36).slice(2, 7)}`;
await page.fill('#tld', tld);
await page.waitForFunction(
  () => document.getElementById('availability').textContent.includes('свободна'),
  { timeout: 30_000 },
);
console.log('✅ доступность:', (await page.textContent('#availability')).trim());

await page.click('#register');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Готово'), {
  timeout: 120_000,
});
const status = (await page.textContent('#status')).trim();
console.log('✅ регистрация:', status);

// 4. независимая проверка результата прямо в сети
const publicClient = createPublicClient({ transport: viemHttp(RPC) });
const owner = await publicClient.readContract({
  address: contract,
  abi: parseAbi(['function ownerOf(string tld) view returns (address)']),
  functionName: 'ownerOf',
  args: [tld],
});
console.log('✅ ownerOf из сети:', owner);
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error('владелец не совпал');

// 5. зона появилась в списке «Мои зоны»
await page.waitForFunction(
  (name) => document.getElementById('zones').textContent.includes(name),
  tld,
  { timeout: 30_000 },
);
console.log('✅ список зон содержит:', tld);

// 6. проверка «занято» на уже зарегистрированную зону
await page.fill('#tld', tld);
await page.waitForFunction(
  () => document.getElementById('availability').textContent.includes('уже зарегистрирована'),
  { timeout: 30_000 },
);
console.log('✅ занятое имя отклоняется формой');

if (errors.length) {
  console.log('⚠️ ошибки консоли:', errors.slice(0, 5));
}

await page.screenshot({ path: 'docs/static-dapp.png', fullPage: true });
await browser.close();
server.close();

const deployed = await publicClient.readContract({
  address: contract,
  abi: parseAbi(['function totalZones() view returns (uint256)']),
  functionName: 'totalZones',
});
console.log('\nВсе проверки пройдены. Всего зон в контракте:', deployed.toString());
console.log('Тестовая зона:', tld);
console.log('Скриншот: justtld/docs/static-dapp.png');
