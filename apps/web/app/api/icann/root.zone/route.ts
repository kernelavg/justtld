import { getRootDnsSnapshot } from '@justtld/db';

export const dynamic = 'force-dynamic';

function serialNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

export async function GET(): Promise<Response> {
  const snapshot = await getRootDnsSnapshot();
  const serial = serialNow();

  const lines: string[] = [
    `; JustTLD Root Authority — Independent Root Zone (IANA-compatible RFC 1035)`,
    `; Generated: ${snapshot.generatedAt}`,
    `; Total delegated TLDs: ${snapshot.zones.length}`,
    `;`,
    `.                        86400  IN  SOA  a.root.justtld.online. hostmaster.justtld.online. ${serial} 1800 900 604800 86400`,
    `.                        86400  IN  NS   a.root.justtld.online.`,
    `.                        86400  IN  NS   ns1.root.justtld.online.`,
    `a.root.justtld.online.   86400  IN  A    95.182.89.37`,
    `ns1.root.justtld.online. 86400  IN  A    95.182.89.37`,
    ``,
    `; ─── Delegated Top-Level Domains (1st Level TLDs) ───`,
  ];

  const recordsByZone = new Map<string, typeof snapshot.records>();
  for (const r of snapshot.records) {
    const z = r.tld.replace(/^\.+/, '').toLowerCase();
    if (!recordsByZone.has(z)) recordsByZone.set(z, []);
    recordsByZone.get(z)!.push(r);
  }

  for (const z of snapshot.zones) {
    const zoneRecords = recordsByZone.get(z.zone) ?? [];
    const apexNs = zoneRecords.filter((r) => !r.subLabel && r.recordType === 'NS');
    lines.push(`; TLD .${z.zone} (owner: ${z.ownerAddress}, mode: ${z.mode})`);
    if (apexNs.length > 0) {
      for (const ns of apexNs) {
        const target = ns.content.endsWith('.') ? ns.content : `${ns.content}.`;
        lines.push(`${z.zone}.  ${ns.ttl}  IN  NS  ${target}`);
      }
    } else {
      lines.push(`${z.zone}.  3600  IN  NS  ns1.root.justtld.online.`);
    }

    const apexA = zoneRecords.filter((r) => !r.subLabel && r.recordType === 'A');
    if (apexA.length > 0) {
      for (const rec of apexA) {
        lines.push(`${z.zone}.  ${rec.ttl}  IN  A  ${rec.content}`);
      }
    } else if (apexNs.length === 0) {
      lines.push(`${z.zone}.  60  IN  A  95.182.89.37`);
    }

    for (const rec of zoneRecords) {
      if (rec.recordType === 'NS' && !rec.subLabel) continue;
      if (rec.recordType === 'A' && !rec.subLabel) continue;
      const ownerName = rec.subLabel ? `${rec.subLabel}.${z.zone}.` : `${z.zone}.`;
      const content =
        rec.recordType === 'TXT'
          ? `"${rec.content.replace(/"/g, '\\"')}"`
          : rec.recordType === 'MX'
            ? `${rec.priority ?? 10} ${rec.content}`
            : rec.content;
      lines.push(`${ownerName}  ${rec.ttl}  IN  ${rec.recordType}  ${content}`);
    }
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
