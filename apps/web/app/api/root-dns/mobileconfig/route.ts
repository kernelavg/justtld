export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://root.justtld.online/dns-query</string>
      </dict>
      <key>PayloadDescription</key>
      <string>Независимый корневой DNS JustTLD (домены 1-го и 2-го уровня без ICANN)</string>
      <key>PayloadDisplayName</key>
      <string>JustTLD Root DNS (DoH)</string>
      <key>PayloadIdentifier</key>
      <string>online.justtld.root.dns</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>8f6f9f6c-6404-4f16-a06c-951828937001</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Подключает независимый корневой DNS JustTLD для открытия доменов 1-го и 2-го уровня (без ICANN, как Handshake).</string>
  <key>PayloadDisplayName</key>
  <string>JustTLD Root DNS</string>
  <key>PayloadIdentifier</key>
  <string>online.justtld.root.profile</string>
  <key>PayloadOrganization</key>
  <string>JustTLD</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>8f6f9f6c-6404-4f16-a06c-951828937000</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
      'Content-Disposition': 'attachment; filename="justtld-root-dns.mobileconfig"',
      'Cache-Control': 'no-store',
    },
  });
}
