/**
 * Публикация исходников контракта на обозревателе (Etherscan + Sourcify).
 *
 * Берёт адрес, владельца и allowReclaim из deployments/<network>.json, поэтому
 * аргументы конструктора всегда совпадают с реальным деплоем.
 *
 *   node scripts/verify-explorer.mjs sepolia
 *   node scripts/verify-explorer.mjs mainnet
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const network = process.argv[2] || 'sepolia';
const root = path.resolve('.');
const deploymentFile = path.join(root, 'deployments', `${network}.json`);

if (!fs.existsSync(deploymentFile)) {
  console.error(`Нет файла ${deploymentFile} — сначала задеплойте контракт.`);
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
const args = [deployment.address, deployment.owner, String(Boolean(deployment.allowReclaim))];

console.log(`Проверка исходников на ${network}:`);
console.log(`  адрес:          ${deployment.address}`);
console.log(`  аргументы:      ${args.slice(1).join(' ')}`);
console.log(
  `  обозреватель:   https://${network}.etherscan.io/address/${deployment.address}#code\n`,
);

const result = spawnSync('npx', ['hardhat', 'verify', '--network', network, ...args], {
  cwd: path.join(root, 'contracts'),
  stdio: 'inherit',
  shell: false,
});

// Повторная отправка в Etherscan не ошибка — контракт уже опубликован.
const etherscanOk = result.status === 0;

console.log('\n— Sourcify —');
const sourcify = spawnSync('node', ['scripts/sourcify-verify.mjs', network], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

process.exit(sourcify.status === 0 ? 0 : etherscanOk ? 1 : 1);
