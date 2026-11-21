import fs from 'node:fs';
import path from 'node:path';
import { ethers, network, artifacts } from 'hardhat';

const ROOT = path.resolve(__dirname, '../..');
const DEPLOYMENTS_DIR = path.join(ROOT, 'deployments');
const GENERATED_ABI_FILE = path.join(ROOT, 'packages/shared/src/generated/registry.ts');

type Deployment = {
  contract: string;
  address: string;
  chainId: number;
  deployBlock: number;
  deployedAt: string;
  deployer: string;
  owner: string;
  allowReclaim: boolean;
  reserved: string[];
  blacklist: string[];
  abiHash: string;
};

const EXTRA_BLACKLIST = (process.env.SEED_EXTRA_BLACKLIST ?? '')
  .split(',')
  .map((word) => word.trim().toLowerCase())
  .filter((word) => word.length >= 2);

const EXTRA_RESERVED = (process.env.SEED_EXTRA_RESERVED ?? '')
  .split(',')
  .map((tld) => tld.trim().toLowerCase())
  .filter((tld) => tld.startsWith('.') && tld.length >= 3);

async function main() {
  // Один и тот же скрипт работает для localhost, sepolia и mainnet:
  // файл деплоя зависит от имени сети в hardhat.config.ts.
  const DEPLOYMENT_FILE = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    throw new Error(
      'Нет аккаунта для деплоя. Для публичной сети задайте DEPLOYER_PRIVATE_KEY в .env.secrets.',
    );
  }
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const artifact = await artifacts.readArtifact('JustTLDRegistry');

  console.log('═'.repeat(74));
  console.log(`JustTLD deploy → network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer / owner: ${deployer.address}`);
  console.log(
    `Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`,
  );
  console.log('═'.repeat(74));

  // Идемпотентность: если контракт уже есть на этой сети — переиспользуем его.
  // FORCE_DEPLOY=1 заставляет задеплоить заново (новая версия контракта), старый файл уходит в архив.
  const FORCE_DEPLOY = process.env.FORCE_DEPLOY === '1';
  if (fs.existsSync(DEPLOYMENT_FILE) && FORCE_DEPLOY) {
    const archived = DEPLOYMENT_FILE.replace(/\.json$/, `.prev-${Date.now()}.json`);
    fs.renameSync(DEPLOYMENT_FILE, archived);
    console.log(`! FORCE_DEPLOY=1 — предыдущий деплой сохранён как ${path.basename(archived)}`);
  }
  if (fs.existsSync(DEPLOYMENT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8')) as Deployment;
    if (existing.chainId === chainId) {
      const code = await ethers.provider.getCode(existing.address).catch(() => '0x');
      if (code && code !== '0x') {
        console.log(`✔ Контракт уже развёрнут по адресу ${existing.address} — переиспользую.`);
        writeGeneratedAbi(artifact.abi);
        await ensureLists(existing);
        return existing;
      }
      console.log(
        `! Сохранённый адрес ${existing.address} не содержит кода (сеть была перезапущена).`,
      );
    }
  }

  const factory = await ethers.getContractFactory('JustTLDRegistry');
  const allowReclaim = (process.env.ALLOW_RECLAIM ?? 'true') !== 'false';
  // Владельцем контракта может сразу стать другой адрес (ADMIN_ADDRESS) — например мультисиг.
  const configuredOwner = process.env.ADMIN_ADDRESS?.trim();
  const initialOwner =
    configuredOwner && /^0x[0-9a-fA-F]{40}$/.test(configuredOwner)
      ? configuredOwner
      : deployer.address;
  const DEV_ACCOUNTS = new Set(
    [
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ].map((address) => address.toLowerCase()),
  );
  const isPublicNetwork = network.name !== 'localhost' && network.name !== 'hardhat';
  if (isPublicNetwork && !configuredOwner) {
    throw new Error(
      'Для публичной сети обязательно задайте ADMIN_ADDRESS в .env.secrets — ' +
        'иначе владельцем контракта станет burner-кошелёк деплоера.',
    );
  }
  if (
    isPublicNetwork &&
    (DEV_ACCOUNTS.has(initialOwner.toLowerCase()) ||
      DEV_ACCOUNTS.has(deployer.address.toLowerCase()))
  ) {
    throw new Error(
      'ADMIN_ADDRESS указывает на публичный тестовый аккаунт Hardhat (значение из .env). ' +
        'Впишите свой адрес в .env.secrets (строка ADMIN_ADDRESS=0x...) — в публичной сети ' +
        'владельцем контракта должен быть ваш кошелёк, а не dev-аккаунт.',
    );
  }

  if (initialOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`Owner контракта при деплое: ${initialOwner} (из ADMIN_ADDRESS)`);
  }
  /**
   * Sepolia отдаёт «дикие» оценки комиссии, а при почти нулевом base fee — ещё и завышенный
   * estimateGas (35–40M вместо реальных 5.3M). Поэтому на публичных сетях комиссию и лимит
   * газа задаём сами: maxFee = 3 × baseFee + PRIORITY_FEE_WEI, gasLimit = DEPLOY_GAS_LIMIT.
   */
  const deployOverrides: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
  } = {};
  if (isPublicNetwork) {
    const block = await ethers.provider.getBlock('latest');
    const baseFee = block?.baseFeePerGas ?? 0n;
    const priorityFee = BigInt(process.env.PRIORITY_FEE_WEI ?? '1000000'); // 0.001 gwei
    const capGwei = BigInt(process.env.MAX_FEE_GWEI ?? '0');
    let maxFee = baseFee * 3n + priorityFee;
    if (capGwei > 0n) {
      const cap = capGwei * 10n ** 9n;
      if (maxFee > cap) maxFee = cap;
    }
    if (maxFee < baseFee) maxFee = baseFee + priorityFee;
    deployOverrides.maxFeePerGas = maxFee;
    deployOverrides.maxPriorityFeePerGas = priorityFee;
    deployOverrides.gasLimit = BigInt(process.env.DEPLOY_GAS_LIMIT ?? '6000000');
    const worstCase = deployOverrides.gasLimit * maxFee;
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(
      `Комиссия: baseFee ${baseFee} wei, maxFee ${ethers.formatUnits(maxFee, 'gwei')} gwei, gasLimit ${deployOverrides.gasLimit}`,
    );
    console.log(
      `Худший случай: ${ethers.formatEther(worstCase)} ETH из ${ethers.formatEther(balance)} ETH на балансе`,
    );
    if (worstCase > balance) {
      throw new Error('Не хватает ETH на газ: пополните burner или снизьте DEPLOY_GAS_LIMIT.');
    }
  }

  const contract = await factory.deploy(initialOwner, allowReclaim, deployOverrides);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait();
  const deployBlock = receipt?.blockNumber ?? 0;

  console.log(`✔ JustTLDRegistry задеплоен: ${address}`);
  console.log(`  tx:      ${receipt?.hash}`);
  console.log(`  block:   ${deployBlock}`);
  console.log(`  gasUsed: ${receipt?.gasUsed?.toString()}`);

  const blacklist: string[] = [];
  for (const word of EXTRA_BLACKLIST) {
    try {
      const tx = await contract.addBlacklistedWord(word);
      await tx.wait();
      blacklist.push(word);
      console.log(`  + blacklist: "${word}"`);
    } catch (error) {
      console.warn(`  ! blacklist "${word}": ${(error as Error).message.split('\n')[0]}`);
    }
  }

  const reserved: string[] = [];
  for (const tld of EXTRA_RESERVED) {
    try {
      const tx = await contract.addReservedTLD(tld);
      await tx.wait();
      reserved.push(tld);
      console.log(`  + reserved: ${tld}`);
    } catch (error) {
      console.warn(`  ! reserved ${tld}: ${(error as Error).message.split('\n')[0]}`);
    }
  }

  const { createHash } = await import('node:crypto');
  const abiHash = createHash('sha256')
    .update(JSON.stringify(artifact.abi))
    .digest('hex')
    .slice(0, 16);

  const deployment: Deployment = {
    contract: 'JustTLDRegistry',
    address,
    chainId,
    deployBlock,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner: await contract.owner(),
    allowReclaim,
    reserved,
    blacklist,
    abiHash,
  };

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify(deployment, null, 2)}\n`);
  writeGeneratedAbi(artifact.abi);

  console.log(`✔ deployments/${network.name}.json записан`);
  console.log(`✔ packages/shared/src/generated/registry.ts обновлён (abi ${abiHash})`);
  const rpc =
    network.name === 'sepolia'
      ? process.env.SEPOLIA_RPC_URL?.trim() || 'https://ethereum-sepolia-rpc.publicnode.com'
      : network.name === 'mainnet'
        ? process.env.MAINNET_RPC_URL
        : (process.env.RPC_URL ?? 'http://127.0.0.1:8545');

  console.log(`\nRPC URL:   ${rpc}`);
  console.log(`Contract:  ${address}`);
  console.log(`Admin:     ${deployment.owner}`);
  console.log(`Reclaim:   ${allowReclaim}`);

  if (network.name !== 'localhost' && network.name !== 'hardhat') {
    const explorer = network.name === 'mainnet' ? 'etherscan.io' : `${network.name}.etherscan.io`;
    console.log('');
    console.log('Публичная сеть — что дальше:');
    console.log(`  1. Проверить контракт в обозревателе:`);
    console.log(
      `     npm run verify:${network.name} -- ${address} ${initialOwner} ${allowReclaim}`,
    );
    console.log(`     ${address} — https://${explorer}/address/${address}`);
    console.log(`  2. Прописать в .env:`);
    console.log(`     CHAIN_ID=${chainId}`);
    console.log(`     DEPLOYMENT_NETWORK=${network.name}`);
    console.log(`     RPC_URL=<публичный RPC этой сети>`);
    console.log(`     ADMIN_ADDRESS=${deployment.owner}`);
    console.log(
      `  3. Перезапустить indexer и веб-приложение (npm run stop:all && npm run start:all).`,
    );
  }
  return deployment;
}

function writeGeneratedAbi(abi: unknown) {
  fs.mkdirSync(path.dirname(GENERATED_ABI_FILE), { recursive: true });
  const content = `/* AUTO-GENERATED by contracts/scripts/deploy.ts — не редактируйте вручную. */
/* eslint-disable */
export const REGISTRY_ABI = ${JSON.stringify(abi, null, 2)} as const;
`;
  fs.writeFileSync(GENERATED_ABI_FILE, content);
}

async function ensureLists(deployment: Deployment) {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    throw new Error(
      'Нет аккаунта для деплоя. Для публичной сети задайте DEPLOYER_PRIVATE_KEY в .env.secrets.',
    );
  }
  const contract = await ethers.getContractAt('JustTLDRegistry', deployment.address, deployer);
  for (const word of EXTRA_BLACKLIST) {
    const isBlacklisted = await contract
      .blacklistedWords()
      .then((words: string[]) => words.includes(word));
    if (!isBlacklisted) {
      try {
        await (await contract.addBlacklistedWord(word)).wait();
        console.log(`  + blacklist: "${word}"`);
      } catch {
        /* уже добавлено или невалидно — не критично */
      }
    }
  }
  for (const tld of EXTRA_RESERVED) {
    const isReserved = await contract.reservedTLDs().then((list: string[]) => list.includes(tld));
    if (!isReserved) {
      try {
        await (await contract.addReservedTLD(tld)).wait();
        console.log(`  + reserved: ${tld}`);
      } catch {
        /* уже добавлено или невалидно — не критично */
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deploy failed:', error);
    process.exit(1);
  });
