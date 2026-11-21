import dgram from 'node:dgram';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import dnsPacket from 'dns-packet';

const HOST = process.env.ROOT_DNS_HOST || '127.0.0.1';
const DNS_PORT = Number(process.env.ROOT_DNS_PORT || 5353);
const DOH_PORT = Number(process.env.ROOT_DOH_PORT || 5354);
const REGISTRY_URL = process.env.JUSTTLD_REGISTRY_URL || 'https://justtld.online/api/root-dns/records';
const GATEWAY_IP = process.env.JUSTTLD_GATEWAY_IP || '95.182.89.37';
const CACHE_FILE = process.env.JUSTTLD_CACHE_FILE || path.join(process.cwd(), 'zones-cache.json');
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 15000);
const UPSTREAMS = ['1.1.1.1', '8.8.8.8'];

// Защита от перехвата популярных ICANN-корней, даже если кто-то когда-то создал такую запись.
const PROTECTED_ICANN_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'ru', 'su', 'rf', 'online', 'io', 'dev', 'app',
  'ai', 'co', 'me', 'tv', 'cc', 'xyz', 'top', 'live', 'store', 'shop', 'cloud', 'pro',
  'site', 'club', 'game', 'tech', 'vip', 'link', 'bio', 'pay', 'fun', 'uk', 'de', 'fr',
  'us', 'eu', 'ua', 'kz', 'by', 'arpa', 'local', 'localhost', 'internal', 'onion',
]);
// Примечание: в JustTLD продаются зоны вроде .site, .game, .club, .pro, .pay, .vip, .cloud, .tech, .link, .bio!
// Пользователь хочет, чтобы купленные в JustTLD зоны работали как независимый корень 1-го уровня,
// но .com / .ru / .online / .org / .net / .io / .fun / .arpa / .local трогать нельзя, чтобы не сломать обычный интернет и justtld.online!
const HARD_ICANN_PROTECTED = new Set([
  'com', 'net', 'org', 'info', 'biz', 'ru', 'su', 'online', 'io', 'dev',
  'ai', 'co', 'me', 'tv', 'cc', 'fun', 'uk', 'de', 'fr', 'us', 'eu', 'ua',
  'kz', 'by', 'arpa', 'local', 'localhost', 'internal', 'onion', 'edu', 'gov', 'mil',
]);

let state = {
  zonesByName: new Map(),
  subdomainsByFqdn: new Map(),
  recordsByKey: new Map(),
  zonesCount: 0,
  subdomainsCount: 0,
  recordsCount: 0,
  updatedAt: null,
};

function applySnapshot(data) {
  const zonesByName = new Map();
  for (const z of data.zones || []) {
    const zone = String(z.zone || '').trim().toLowerCase().replace(/^\.+/, '');
    if (!zone || HARD_ICANN_PROTECTED.has(zone)) continue;
    zonesByName.set(zone, z);
  }

  const subdomainsByFqdn = new Map();
  for (const s of data.subdomains || []) {
    const fqdn = String(s.fqdn || '').trim().toLowerCase();
    if (fqdn) subdomainsByFqdn.set(fqdn, s);
  }

  const recordsByKey = new Map();
  for (const r of data.records || []) {
    const zone = String(r.tld || '').trim().toLowerCase().replace(/^\.+/, '');
    const sub = String(r.subLabel || '').trim().toLowerCase();
    if (!zone || HARD_ICANN_PROTECTED.has(zone)) continue;
    const key = sub ? `${sub}.${zone}` : zone;
    if (!recordsByKey.has(key)) recordsByKey.set(key, []);
    recordsByKey.get(key).push(r);
  }

  state = {
    zonesByName,
    subdomainsByFqdn,
    recordsByKey,
    zonesCount: zonesByName.size,
    subdomainsCount: subdomainsByFqdn.size,
    recordsCount: (data.records || []).length,
    updatedAt: data.generatedAt || new Date().toISOString(),
  };
}

function loadDiskCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      applySnapshot(parsed);
      console.log(`[root-dns] loaded disk cache: ${state.zonesCount} zones`);
    }
  } catch (err) {
    console.warn('[root-dns] failed reading disk cache:', err.message);
  }
}

async function syncRegistry() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.zones)) throw new Error('Invalid snapshot payload');
    applySnapshot(data);
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch {
      // ignore disk write errors
    }
  } catch (err) {
    console.warn('[root-dns] sync warning:', err.message);
  }
}

function buildSoaRecord(zone) {
  return {
    type: 'SOA',
    class: 'IN',
    name: zone,
    ttl: 300,
    data: {
      mname: 'ns1.root.justtld.online',
      rname: 'hostmaster.justtld.online',
      serial: Math.floor(Date.now() / 1000),
      refresh: 3600,
      retry: 600,
      expire: 86400,
      minimum: 60,
    },
  };
}

function recordToPacketAnswer(name, rec) {
  const ttl = Number(rec.ttl) || 60;
  const type = String(rec.recordType || '').toUpperCase();
  const content = String(rec.content || '').trim();
  if (!content) return null;

  if (type === 'A' || type === 'AAAA' || type === 'CNAME' || type === 'NS') {
    return { type, class: 'IN', name, ttl, data: content };
  }
  if (type === 'TXT') {
    return { type: 'TXT', class: 'IN', name, ttl, data: [Buffer.from(content)] };
  }
  if (type === 'MX') {
    return {
      type: 'MX',
      class: 'IN',
      name,
      ttl,
      data: { preference: Number(rec.priority) || 10, exchange: content },
    };
  }
  return null;
}

function resolveLocally(qname, qtype) {
  const clean = qname.toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!clean) return null;
  const parts = clean.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  const zone = parts[parts.length - 1];
  if (HARD_ICANN_PROTECTED.has(zone)) return null;
  if (!state.zonesByName.has(zone)) return null;

  const customRecords = state.recordsByKey.get(clean) || [];
  const answers = [];

  // Проверяем явные пользовательские записи запрошенного типа
  for (const rec of customRecords) {
    if (rec.recordType === qtype) {
      const ans = recordToPacketAnswer(clean, rec);
      if (ans) answers.push(ans);
    }
  }

  // Если запрашивали A/AAAA, а явной нет, но есть CNAME — отдаём CNAME
  if (answers.length === 0 && (qtype === 'A' || qtype === 'AAAA')) {
    for (const rec of customRecords) {
      if (rec.recordType === 'CNAME') {
        const ans = recordToPacketAnswer(clean, rec);
        if (ans) answers.push(ans);
      }
    }
  }

  // Дефолтный маршрут Root DNS: 1-й уровень (zone) и 2-й уровень (sub.zone) ведут на наш Root Gateway!
  if (answers.length === 0) {
    if (qtype === 'A') {
      answers.push({
        type: 'A',
        class: 'IN',
        name: clean,
        ttl: 60,
        data: GATEWAY_IP,
      });
    } else if (qtype === 'NS') {
      answers.push({
        type: 'NS',
        class: 'IN',
        name: clean,
        ttl: 300,
        data: 'ns1.root.justtld.online',
      });
    } else if (qtype === 'SOA') {
      answers.push(buildSoaRecord(zone));
    }
  }

  return {
    zone,
    rcode: 0, // NOERROR
    answers,
    authorities: answers.length === 0 ? [buildSoaRecord(zone)] : [],
  };
}

function forwardUdp(rawBuffer) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { client.close(); } catch {}
      reject(new Error('Upstream DNS timeout'));
    }, 3500);

    client.on('message', (msg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { client.close(); } catch {}
      resolve(msg);
    });

    client.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { client.close(); } catch {}
      reject(err);
    });

    client.send(rawBuffer, 53, UPSTREAMS[0]);
  });
}

async function handleWireQuery(rawBuffer) {
  const req = dnsPacket.decode(rawBuffer);
  const question = req.questions && req.questions[0];
  if (!question) {
    return dnsPacket.encode({
      type: 'response',
      id: req.id,
      flags: dnsPacket.RECURSION_AVAILABLE | 1, // FORMERR
      questions: [],
      answers: [],
    });
  }

  const local = resolveLocally(question.name, question.type);
  if (local) {
    return dnsPacket.encode({
      type: 'response',
      id: req.id,
      flags:
        dnsPacket.AUTHORITATIVE_ANSWER |
        dnsPacket.RECURSION_AVAILABLE |
        (req.flags & dnsPacket.RECURSION_DESIRED),
      questions: req.questions,
      answers: local.answers,
      authorities: local.authorities,
    });
  }

  try {
    return await forwardUdp(rawBuffer);
  } catch {
    return dnsPacket.encode({
      type: 'response',
      id: req.id,
      flags: dnsPacket.RECURSION_AVAILABLE | 2, // SERVFAIL
      questions: req.questions,
      answers: [],
    });
  }
}

// 1. UDP DNS Server
const udpServer = dgram.createSocket('udp4');
udpServer.on('message', async (msg, rinfo) => {
  try {
    const resp = await handleWireQuery(msg);
    udpServer.send(resp, rinfo.port, rinfo.address);
  } catch (err) {
    console.error('[root-dns] udp error:', err.message);
  }
});
udpServer.bind(DNS_PORT, HOST, () => {
  console.log(`[root-dns] UDP listening on ${HOST}:${DNS_PORT}`);
});

// 2. TCP DNS Server
const tcpServer = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  socket.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const len = buf.readUInt16BE(0);
      if (buf.length < len + 2) break;
      const packet = buf.subarray(2, 2 + len);
      buf = buf.subarray(2 + len);
      try {
        const resp = await handleWireQuery(packet);
        const out = Buffer.allocUnsafe(2 + resp.length);
        out.writeUInt16BE(resp.length, 0);
        resp.copy(out, 2);
        socket.write(out);
      } catch {
        socket.end();
      }
    }
  });
});
tcpServer.listen(DNS_PORT, HOST, () => {
  console.log(`[root-dns] TCP listening on ${HOST}:${DNS_PORT}`);
});

// 3. DoH HTTP Server (RFC 8484 + JSON API)
const dohServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        zonesCount: state.zonesCount,
        subdomainsCount: state.subdomainsCount,
        recordsCount: state.recordsCount,
        updatedAt: state.updatedAt,
      }),
    );
    return;
  }

  if (parsedUrl.pathname !== '/dns-query') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  try {
    // JSON DoH mode (GET /dns-query?name=expline&type=A)
    const nameParam = parsedUrl.searchParams.get('name');
    if (req.method === 'GET' && nameParam) {
      const qname = nameParam.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
      const qtype = (parsedUrl.searchParams.get('type') || 'A').trim().toUpperCase();
      const local = resolveLocally(qname, qtype);
      if (local) {
        res.writeHead(200, { 'Content-Type': 'application/dns-json; charset=utf-8' });
        res.end(
          JSON.stringify({
            Status: local.rcode,
            TC: false,
            RD: true,
            RA: true,
            AD: false,
            CD: false,
            JustTLDRoot: true,
            Zone: local.zone,
            Question: [{ name: qname, type: qtype }],
            Answer: local.answers.map((a) => ({
              name: a.name,
              type: a.type,
              TTL: a.ttl,
              data:
                typeof a.data === 'string'
                  ? a.data
                  : Array.isArray(a.data)
                    ? Buffer.concat(a.data).toString('utf8')
                    : JSON.stringify(a.data),
            })),
          }),
        );
        return;
      }

      // Forward JSON query to Cloudflare DoH
      const cfRes = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(qname)}&type=${encodeURIComponent(qtype)}`,
        { headers: { Accept: 'application/dns-json' } },
      );
      const cfText = await cfRes.text();
      res.writeHead(cfRes.status, { 'Content-Type': 'application/dns-json; charset=utf-8' });
      res.end(cfText);
      return;
    }

    // RFC 8484 binary DNS-over-HTTPS
    let dnsWire = null;
    if (req.method === 'GET') {
      const dnsParam = parsedUrl.searchParams.get('dns');
      if (dnsParam) {
        dnsWire = Buffer.from(dnsParam, 'base64url');
      }
    } else if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      dnsWire = Buffer.concat(chunks);
    }

    if (!dnsWire || dnsWire.length < 12) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request: missing DNS message');
      return;
    }

    const reply = await handleWireQuery(dnsWire);
    res.writeHead(200, {
      'Content-Type': 'application/dns-message',
      'Cache-Control': 'max-age=60',
    });
    res.end(reply);
  } catch (err) {
    console.error('[root-dns] doh error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Error');
  }
});

dohServer.listen(DOH_PORT, HOST, () => {
  console.log(`[root-dns] DoH HTTP listening on http://${HOST}:${DOH_PORT}/dns-query`);
});

loadDiskCache();
void syncRegistry();
setInterval(() => void syncRegistry(), SYNC_INTERVAL_MS);
