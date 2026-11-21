import { getRootDnsSnapshot } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async () => {
    const snapshot = await getRootDnsSnapshot();
    return jsonResponse({
      ...snapshot,
      gatewayIp: '95.182.89.37',
      dohUrl: 'https://root.justtld.online/dns-query',
      rootNs: 'ns1.root.justtld.online',
    });
  },
  { limit: 'read', bucket: 'root-dns-records' },
);
