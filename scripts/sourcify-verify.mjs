/**
 * Публикация исходников в Sourcify (exact match) через API v2.
 *
 * Плагин hardhat-verify пока работает со старым Sourcify API v1, который отключён,
 * поэтому отправляем стандартный JSON-вход напрямую. Компиляционный вход берём из
 * build-info Hardhat, чей runtime-bytecode совпадает с байткодом на цепи.
 *
 *   node scripts/sourcify-verify.mjs sepolia
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, http } from 'viem';

const NETWORK_CHAIN = { mainnet: 1, sepolia: 11155111, localhost: 31337 };
const network = process.argv[2] || 'sepolia';
const chainId = NETWORK_CHAIN[network];
if (!chainId) {
  console.error(`Неизвестная сеть: ${network}`);
  process.exit(1);
}

const root = path.resolve('.');
const deployment = JSON.parse(
  fs.readFileSync(path.join(root, 'deployments', `${network}.json`), 'utf8'),
);
const address = deployment.address;
const rpcUrl = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const headers = { 'user-agent': 'justtld-verify/1.0 (justtld)' };

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const onChainCode = (await publicClient.getCode({ address })).toLowerCase();

const buildInfoDir = path.join(root, 'contracts', 'artifacts', 'build-info');
const contractId = 'contracts/JustTLDRegistry.sol:JustTLDRegistry';
let chosen = null;
for (const file of fs.readdirSync(buildInfoDir)) {
  const info = JSON.parse(fs.readFileSync(path.join(buildInfoDir, file), 'utf8'));
  const artifact = info.output?.contracts?.['contracts/JustTLDRegistry.sol']?.JustTLDRegistry;
  if (!artifact) continue;
  if (`0x${artifact.evm.deployedBytecode.object}`.toLowerCase() === onChainCode) {
    chosen = { file, info };
    break;
  }
}
if (!chosen) {
  console.error('Ни один build-info не совпал с байткодом на цепи — пересоберите контракты.');
  process.exit(1);
}
console.log(`Sourcify: отправляю ${address} (build-info ${chosen.file})…`);

const submit = await fetch(`https://sourcify.dev/server/v2/verify/${chainId}/${address}`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    stdJsonInput: chosen.info.input,
    compilerVersion: chosen.info.solcLongVersion,
    contractIdentifier: contractId,
    creationTransactionHash: deployment.deployTx ?? undefined,
  }),
});

let alreadyVerified = false;
if (submit.status === 409) {
  alreadyVerified = true;
  console.log('Sourcify: контракт уже опубликован ранее, проверяю статус…');
} else if (!submit.ok) {
  console.error(`Sourcify ответил ${submit.status}: ${(await submit.text()).slice(0, 500)}`);
  process.exit(1);
}

if (!alreadyVerified) {
  const { verificationId } = await submit.json();
  let job = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await fetch(`https://sourcify.dev/server/v2/verify/${verificationId}`, {
      headers,
    });
    job = await response.json();
    if (job.isJobCompleted) break;
  }
  if (!job?.isJobCompleted) {
    console.error('Sourcify не завершил проверку за минуту, id:', verificationId);
    process.exit(1);
  }
}

const contract = await (
  await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}`, { headers })
).json();

console.log(`Sourcify: match = ${contract.match}`);
console.log(
  `  creation: ${contract.creationMatch ?? '—'}, runtime: ${contract.runtimeMatch ?? '—'}`,
);
console.log(`  https://repo.sourcify.dev/contracts/${chainId}/${address}`);
if (contract.match !== 'exact_match' && contract.match !== 'match') {
  process.exit(1);
}
