import { chromium } from 'playwright';
const base = 'https://justtld.onrender.com';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
for (const [path, file] of [
  ['/', 'docs/deploy-home.png'],
  ['/zone/.myzone', 'docs/deploy-zone.png'],
  ['/explorer', 'docs/deploy-explorer.png'],
]) {
  const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: file, fullPage: false });
  const text = (await page.evaluate(() => document.body.innerText))
    .replace(/\s+/g, ' ')
    .slice(0, 160);
  console.log(path, '->', res.status(), '|', text);
}
await browser.close();
