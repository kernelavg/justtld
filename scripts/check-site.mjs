/**
 * Быстрая диагностика опубликованного сайта: открывает URL в настоящем браузере
 * и показывает HTTP-статус, заголовок, первые строки текста и делает скриншот.
 *
 *   node scripts/check-site.mjs https://ваш-сайт.infinityfreeapp.com
 */
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) {
  console.error('Использование: node scripts/check-site.mjs <url>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  // обычный мобильный Chrome, как во встроенном браузере MetaMask
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 },
});

const responses = [];
page.on('response', (response) => {
  if (response.request().resourceType() === 'document') {
    responses.push({ status: response.status(), url: response.url() });
  }
});

let error = null;
try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  responses.push({ status: response?.status(), url: response?.url() });
} catch (caught) {
  error = String(caught);
}

const info = await page.evaluate(() => ({
  title: document.title,
  text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  hasDapp: Boolean(window.__JUSTTLD__),
  hasViem: typeof window.__JUSTTLD__?.validateTld === 'function',
}));

await page.screenshot({ path: 'docs/site-check.png', fullPage: false });
await browser.close();

console.log('URL:', url);
console.log('Ответы:', JSON.stringify(responses));
if (error) console.log('Ошибка перехода:', error);
console.log('Title:', JSON.stringify(info.title));
console.log('Текст:', JSON.stringify(info.text));
console.log('Страница JustTLD загрузилась (JS выполнился):', info.hasDapp);
console.log('Скриншот: docs/site-check.png');
