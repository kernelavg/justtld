import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'node:fs';
const dep = JSON.parse(readFileSync('deployments/localhost.json', 'utf8'));
const abi = JSON.parse(
  readFileSync('contracts/artifacts/contracts/JustTLDRegistry.sol/JustTLDRegistry.json', 'utf8'),
).abi;
const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);
const chain = {
  id: dep.chainId,
  name: 'local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
} as const;
const wallet = createWalletClient({ account, chain, transport: http('http://127.0.0.1:8545') });
const pub = createPublicClient({ transport: http('http://127.0.0.1:8545') });
const hash = await wallet.writeContract({
  address: dep.address,
  abi,
  functionName: 'registerTLD',
  args: ['.demo-zone', '{"description":"first zone"}'],
});
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log('tx', hash, 'block', receipt.blockNumber, 'status', receipt.status);
