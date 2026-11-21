import fs from 'node:fs';
import path from 'node:path';
import { ethers, network, artifacts } from 'hardhat';

/**
 * Деплой контракта поддоменов JustTLDSubdomains.
 *
 * После репрайсинга газа (2026) лимит одной транзакции — 16 777 216 газа,
 * а деплой байта кода стоит ~1 560 газа. Поэтому контракт оптимизирован под размер
 * (optimizer runs = 1) и укладывается в ~9.1 КБ рантайма.
 *
 * Адрес реестра зон берётся из deployments/<network>.json (его пишет scripts/deploy.ts).
 */

const ROOT = path.resolve(__dirname, '../..');
const DEPLOYMENTS_DIR = path.join(ROOT, 'deployments');

async function main() {
  const registryFile = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  if (!fs.existsSync(registryFile)) {
    throw new Error(
      `Нет ${registryFile}: сначала задеплойте реестр (npm run deploy:${network.name}).`,
    );
  }
  const registryDeployment = JSON.parse(fs.readFileSync(registryFile, 'utf8')) as {
    contract: string;
    address: string;
    chainId: number;
  };

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error('Нет аккаунта для деплоя: задайте DEPLOYER_PRIVATE_KEY.');

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== registryDeployment.chainId) {
    throw new Error(
      `Сеть не совпадает: реестр задеплоен в chainId ${registryDeployment.chainId}, сейчас ${chainId}.`,
    );
  }

  const admin = process.env.ADMIN_ADDRESS?.trim() || deployer.address;
  const isPublicNetwork = network.name !== 'localhost' && network.name !== 'hardhat';

  console.log('═'.repeat(74));
  console.log(`JustTLDSubdomains deploy → ${network.name} (chainId ${chainId})`);
  console.log(`Registry: ${registryDeployment.address}`);
  console.log(`Owner:    ${admin}`);
  console.log(
    `Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`,
  );
  console.log('═'.repeat(74));

  const artifact = await artifacts.readArtifact('JustTLDSubdomains');
  const factory = await ethers.getContractFactory('JustTLDSubdomains');

  const overrides: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasLimit?: bigint } = {};
  if (isPublicNetwork) {
    const block = await ethers.provider.getBlock('latest');
    const baseFee = block?.baseFeePerGas ?? 0n;
    const minFee = baseFee * 2n + 1n;
    overrides.maxFeePerGas = minFee;
    overrides.maxPriorityFeePerGas = 0n;
  }

  const unsigned = await factory.getDeployTransaction(registryDeployment.address, admin, overrides);
  const estimate = await ethers.provider.estimateGas({ ...unsigned, from: deployer.address });
  const TX_CAP = 16_777_216n;
  const gasLimit = (estimate * 105n) / 100n;
  console.log(`estimateGas: ${estimate} | беру лимит ${gasLimit} (кап tx ${TX_CAP})`);
  if (gasLimit > TX_CAP) {
    throw new Error('Контракт не влезает в лимит газа транзакции — сократите код.');
  }
  overrides.gasLimit = gasLimit;

  const worstCase = gasLimit * (overrides.maxFeePerGas ?? 0n);
  console.log(`Худший случай по газу: ${ethers.formatEther(worstCase)} ETH`);

  const contract = await factory.deploy(registryDeployment.address, admin, overrides);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait();
  console.log(`✔ JustTLDSubdomains: ${address}`);
  console.log(`  tx:      ${receipt?.hash}`);
  console.log(`  block:   ${receipt?.blockNumber}`);
  console.log(`  gasUsed: ${receipt?.gasUsed?.toString()}`);

  const file = path.join(DEPLOYMENTS_DIR, `${network.name}.subdomains.json`);
  const payload = {
    contract: 'JustTLDSubdomains',
    address,
    registry: registryDeployment.address,
    chainId,
    deployBlock: receipt?.blockNumber ?? 0,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner: await contract.owner(),
    runtimeBytes: Math.round((artifact.deployedBytecode.length - 2) / 2),
    abiHash: ethers.id(JSON.stringify(artifact.abi)).slice(2, 18),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`✔ deployments/${network.name}.subdomains.json записан`);

  if (isPublicNetwork) {
    const explorer = network.name === 'mainnet' ? 'etherscan.io' : `${network.name}.etherscan.io`;
    console.log('');
    console.log('Дальше:');
    console.log(
      `  1. Верификация: npx hardhat verify --network ${network.name} ${address} ${registryDeployment.address} ${admin}`,
    );
    console.log(`     https://${explorer}/address/${address}`);
    console.log(`  2. Прописать в .env: SUBDOMAINS_ADDRESS=${address}`);
  }
}

main().catch((error) => {
  console.error('Deploy failed:', error);
  process.exitCode = 1;
});
