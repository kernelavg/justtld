function openDomain(raw) {
  const clean = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!clean) return;
  const parts = clean.split('.').filter(Boolean);
  let targetUrl = 'https://justtld.online/root';
  if (parts.length === 1) {
    targetUrl = `https://justtld.online/api/site-serve?zone=${encodeURIComponent(parts[0])}&root=1&path=%2F`;
  } else if (parts.length >= 2) {
    targetUrl = `https://justtld.online/api/site-serve?zone=${encodeURIComponent(parts[parts.length - 1])}&label=${encodeURIComponent(parts[0])}&root=1&path=%2F`;
  }
  chrome.tabs.create({ url: targetUrl });
}

async function renderZones() {
  const data = await chrome.storage.local.get(['justtldZones']);
  const zones = Array.isArray(data.justtldZones) ? data.justtldZones : [];
  document.getElementById('count').textContent = `${zones.length} зон`;
  const list = document.getElementById('zonesList');
  list.innerHTML = '';
  for (const z of zones.slice(0, 40)) {
    const row = document.createElement('div');
    row.className = 'item';
    const name = document.createElement('span');
    name.className = 'zone';
    name.textContent = `http://${z.zone}`;
    const link = document.createElement('a');
    link.className = 'open';
    link.href = '#';
    link.textContent = 'Открыть →';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openDomain(z.zone);
    });
    row.appendChild(name);
    row.appendChild(link);
    list.appendChild(row);
  }
}

document.getElementById('goForm').addEventListener('submit', (e) => {
  e.preventDefault();
  openDomain(document.getElementById('addr').value);
});

document.getElementById('syncBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
    void renderZones();
  });
});

document.getElementById('portalBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://justtld.online/root' });
});

void renderZones();
