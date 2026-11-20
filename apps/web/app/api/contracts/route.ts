import { APP_VERSION } from '@justtld/shared';
import { jsonResponse, route } from '@/lib/server/http';
import {
  adminAddress,
  chainId,
  chainName,
  deployment,
  devWalletEnabled,
  explorerTxUrlTemplate,
  rpcUrl,
} from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const GET = route(
  async () => {
    const dep = deployment();
    return jsonResponse({
      app: 'JustTLD',
      version: APP_VERSION,
      contract: dep
        ? {
            name: dep.contract,
            address: dep.address,
            chainId: dep.chainId,
            deployBlock: dep.deployBlock,
            deployer: dep.deployer,
            owner: dep.owner,
            allowReclaim: dep.allowReclaim,
            abiHash: dep.abiHash ?? null,
          }
        : null,
      chain: { id: chainId(), name: chainName(), rpcUrl },
      adminAddress: adminAddress(),
      devWalletEnabled: devWalletEnabled(),
      explorer: { txUrlTemplate: explorerTxUrlTemplate() },
    });
  },
  { limit: 'read', bucket: 'contracts' },
);
