export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const hints = `;       This file holds the information on root name servers needed to
;       initialize cache of Internet domain name servers for JustTLD Root
;       (Independent No-ICANN Root Authority, IANA-compatible format).
;
;       DoH endpoint: https://root.justtld.online/dns-query
;       Root Zone:    https://justtld.online/api/icann/root.zone
;
.                        3600000      NS    A.ROOT.JUSTTLD.ONLINE.
A.ROOT.JUSTTLD.ONLINE.   3600000      A     95.182.89.37
.                        3600000      NS    NS1.ROOT.JUSTTLD.ONLINE.
NS1.ROOT.JUSTTLD.ONLINE. 3600000      A     95.182.89.37
`;

  return new Response(hints, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="named.root"',
      'Cache-Control': 'no-store',
    },
  });
}
