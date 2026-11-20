/**
 * Передача владения контрактом JustTLDRegistry (роль администратора).
 *
 *   npx tsx scripts/transfer-ownership.mts 0xВАШ_АДРЕС --dry-run   # проверка без транзакции
 *   npx tsx scripts/transfer-ownership.mts 0xВАШ_АДРЕС             # реальная транзакция
 *
 * Ключ деплоера берётся из .env.secrets (burner, только газ).
 * После успешной передачи обновляются deployments/<network>.json, .env.secrets и .env:
 * ADMIN_ADDRESS = новый владелец.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ABI = parseAbi([
  'function owner() view returns (address)',
  'function transferOwnership(address newOwner)',
  'function pendingOwner() view returns (address)',
]);

const NETWORKS: Record<string, { chainId: number; rpc: string; explorer: string }> = {
  sepolia: {
    chainId: 11155111,
    rpc: process.env.SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
  },
  mainnet: {
    chainId: 1,
    rpc: process.env.MAINNET_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
  },
  localhost: {
    chainId: 31337,
    rpc: process.env.RPC_URL?.trim() || 'http://127.0.0.1:8545',
    explorer: '',
  },
};

function readEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match?.[1]) result[match[1]] = (match[2] ?? '').trim();
  }
  return result;
}

function writeEnvKey(file: string, key: string, value: string) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match?.[1] === key) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) next.push(`${key}=${value}`);
  fs.writeFileSync(file, `${next.join('\n').replace(/\n+$/, '')}\n`);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rawAddress = args.find((arg) => !arg.startsWith('--'));

if (!rawAddress || !isAddress(rawAddress)) {
  console.error('Использование: npx tsx scripts/transfer-ownership.mts 0xАДРЕС [--dry-run]');
  process.exit(1);
}

const newOwner = getAddress(rawAddress);
const network = process.env.DEPLOYMENT_NETWORK?.trim() || 'sepolia';
const config = NETWORKS[network];
if (!config) {
  console.error(`Неизвестная сеть ${network}. Доступно: ${Object.keys(NETWORKS).join(', ')}`);
  process.exit(1);
}

const root = process.cwd();
const secrets = readEnvFile(path.join(root, '.env.secrets'));
const deploymentFile = path.join(root, 'deployments', `${network}.json`);
if (!fs.existsSync(deploymentFile)) {
  console.error(`Нет файла ${deploymentFile} — сначала деплой.`);
  process.exit(1);
}
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) as {
  address: `0x${string}`;
  owner: string;
};

const privateKey = (secrets.DEPLOYER_PRIVATE_KEY ?? '').trim();
if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
  console.error('В .env.secrets нет корректного DEPLOYER_PRIVATE_KEY.');
  process.exit(1);
}

const account = privateKeyToAccount(privateKey as `0x${string}`);
const chain = {
  id: config.chainId,
  name: network,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpc] } },
} as const;
const pub = createPublicClient({ chain, transport: http(config.rpc) });
const wallet = createWalletClient({ account, chain, transport: http(config.rpc) });

const currentOwner = await pub.readContract({
  address: deployment.address,
  abi: ABI,
  functionName: 'owner',
});

console.log(`Сеть:      ${network} (chainId ${config.chainId})`);
console.log(`Контракт:  ${deployment.address}`);
console.log(`Владелец:  ${currentOwner}`);
console.log(`Новый:     ${newOwner}`);
console.log(`Отправитель (ключ из .env.secrets): ${account.address}`);

if (currentOwner.toLowerCase() !== account.address.toLowerCase()) {
  console.error(
    '\nПередавать владение может только текущий owner. Ключ в .env.secrets не совпадает с owner контракта.',
  );
  process.exit(1);
}
if (currentOwner.toLowerCase() === newOwner.toLowerCase()) {
  console.log('\nНовый адрес уже является владельцем — ничего делать не нужно.');
  process.exit(0);
}

// Симуляция: проверяем, что вызов пройдёт, и сколько будет стоить.
const { request } = await pub.simulateContract({
  address: deployment.address,
  abi: ABI,
  functionName: 'transferOwnership',
  args: [newOwner],
  account,
});
const gas = await pub.estimateContractGas(request);
const gasPrice = await pub.getGasPrice();
const costEth = (Number(gas) * Number(gasPrice)) / 1e18;
console.log(`Газ:       ${gas.toString()} ≈ ${costEth.toFixed(8)} ETH`);
console.log(
  `Баланс отправителя: ${Number(await pub.getBalance({ address: account.address })) / 1e18} ETH`,
);

if (dryRun) {
  console.log('\n[dry-run] симуляция успешна, транзакция не отправлена.');
  process.exit(0);
}

const hash = await wallet.writeContract(request);
console.log(`\nТранзакция: ${hash}`);
if (config.explorer) console.log(`Etherscan:  ${config.explorer}/tx/${hash}`);

const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') {
  console.error('Транзакция не выполнена.');
  process.exit(1);
}

const updatedOwner = await pub.readContract({
  address: deployment.address,
  abi: ABI,
  functionName: 'owner',
});
console.log(
  `Блок: ${receipt.blockNumber.toString()}, газ использован: ${receipt.gasUsed.toString()}`,
);
console.log(`Новый владелец контракта: ${updatedOwner}`);

if (updatedOwner.toLowerCase() === newOwner.toLowerCase()) {
  deployment.owner = updatedOwner;
  fs.writeFileSync(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
  for (const file of [path.join(root, '.env.secrets'), path.join(root, '.env')]) {
    writeEnvKey(file, 'ADMIN_ADDRESS', updatedOwner);
  }
  console.log('Обновлено: deployments/' + network + '.json, .env.secrets, .env');
  console.log('Перезапустите сервисы: npm run stop:all && npm run start:all');
} else {
  console.error(
    'Внимание: owner на контракте не совпадает с ожидаемым. Разберитесь до перезапуска.',
  );
  process.exit(1);
}
