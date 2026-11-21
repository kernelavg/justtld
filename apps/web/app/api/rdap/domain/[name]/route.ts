import { getIcannDirectoryEntry } from '@justtld/db';
import { jsonResponse, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(
  async (_request, context) => {
    const params = await (context as { params: Promise<{ name: string }> }).params;
    const rawName = decodeURIComponent(params.name || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!rawName || !/^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(rawName)) {
      return jsonResponse(
        {
          rdapConformance: ['rdap_level_0'],
          errorCode: 400,
          title: 'Bad Request',
          description: ['Invalid domain or TLD name'],
        },
        {
          status: 400,
          headers: { 'Content-Type': 'application/rdap+json; charset=utf-8' },
        },
      );
    }

    const entry = await getIcannDirectoryEntry(rawName);
    if (!entry.found) {
      return jsonResponse(
        {
          rdapConformance: [
            'rdap_level_0',
            'icann_rdap_response_profile_0',
            'icann_rdap_technical_implementation_guide_0',
          ],
          errorCode: 404,
          title: 'Domain Not Found',
          description: [`${rawName} is not registered in JustTLD Root Authority`],
          ldhName: rawName,
          available: true,
        },
        {
          status: 404,
          headers: { 'Content-Type': 'application/rdap+json; charset=utf-8' },
        },
      );
    }

    const rdapPayload = {
      rdapConformance: [
        'rdap_level_0',
        'icann_rdap_response_profile_0',
        'icann_rdap_technical_implementation_guide_0',
      ],
      objectClassName: 'domain',
      handle: `JUSTTLD-${entry.fqdn.toUpperCase()}`,
      ldhName: entry.fqdn,
      unicodeName: entry.fqdn,
      status: [entry.status === 'active' ? 'active' : entry.status],
      events: [
        ...(entry.registeredAt
          ? [{ eventAction: 'registration', eventDate: entry.registeredAt }]
          : []),
        ...(entry.expiresAt
          ? [{ eventAction: 'expiration', eventDate: entry.expiresAt }]
          : []),
        { eventAction: 'last update of RDAP database', eventDate: new Date().toISOString() },
      ],
      nameservers: entry.nameservers.map((ns) => ({
        objectClassName: 'nameserver',
        ldhName: ns,
      })),
      entities: [
        {
          objectClassName: 'entity',
          handle: 'JUSTTLD-REGISTRAR',
          roles: ['registrar'],
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['fn', {}, 'text', 'JustTLD Root Authority'],
              ['url', {}, 'text', 'https://justtld.online'],
            ],
          ],
        },
        ...(entry.ownerAddress
          ? [
              {
                objectClassName: 'entity',
                handle: entry.ownerAddress,
                roles: ['registrant'],
                vcardArray: [
                  'vcard',
                  [
                    ['version', {}, 'text', '4.0'],
                    ['fn', {}, 'text', entry.ownerAddress],
                  ],
                ],
              },
            ]
          : []),
      ],
      notices: [
        {
          title: 'JustTLD Independent Root Network',
          description: [
            'Managed by JustTLD Root Authority (independent from global ICANN).',
            'DoH Resolver: https://root.justtld.online/dns-query',
            'WHOIS Server: whois.justtld.online:43 (95.182.89.37:43)',
          ],
        },
      ],
      justtld: {
        level: entry.level,
        tld: entry.tld,
        zone: entry.zone,
        subLabel: entry.subLabel,
        source: entry.source,
        siteMode: entry.siteMode,
        dnsRecords: entry.dnsRecords,
      },
    };

    return jsonResponse(rdapPayload, {
      status: 200,
      headers: { 'Content-Type': 'application/rdap+json; charset=utf-8' },
    });
  },
  { limit: 'read', bucket: 'rdap-domain' },
);
