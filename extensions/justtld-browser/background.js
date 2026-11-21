const REGISTRY_URL = 'https://justtld.online/api/root-dns/records';
const ALARM_NAME = 'justtld-sync-zones';

async function syncRootZones() {
  try {
    const res = await fetch(REGISTRY_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const zones = Array.isArray(data.zones) ? data.zones : [];

    await chrome.storage.local.set({
      justtldZones: zones,
      justtldUpdatedAt: Date.now(),
    });

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((r) => r.id);

    const addRules = [];
    let ruleId = 1;
    for (const entry of zones) {
      const zone = String(entry.zone || '').toLowerCase().trim();
      if (!zone || !/^[a-z0-9-]+$/.test(zone)) continue;

      // 1-й уровень: http://zone/path -> прямой рендер сайта зоны
      addRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: `https://justtld.online/api/site-serve?zone=${zone}&root=1&path=/\\1`,
          },
        },
        condition: {
          regexFilter: `^https?://${zone}(?::\\d+)?/(.*)$`,
          resourceTypes: ['main_frame'],
        },
      });

      // 2-й уровень: http://sub.zone/path -> прямой рендер поддомена
      addRules.push({
        id: ruleId++,
        priority: 2,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: `https://justtld.online/api/site-serve?zone=${zone}&label=\\1&root=1&path=/\\2`,
          },
        },
        condition: {
          regexFilter: `^https?://([a-z0-9-]+)\\.${zone}(?::\\d+)?/(.*)$`,
          resourceTypes: ['main_frame'],
        },
      });

      if (ruleId > 4500) break;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (err) {
    console.warn('[JustTLD Root] sync failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncRootZones();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  void syncRootZones();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void syncRootZones();
});

chrome.omnibox.onInputEntered.addListener((text) => {
  const clean = text.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!clean) return;
  const parts = clean.split('.').filter(Boolean);
  let targetUrl = 'https://justtld.online/root';
  if (parts.length === 1) {
    targetUrl = `https://justtld.online/api/site-serve?zone=${encodeURIComponent(parts[0])}&root=1&path=%2F`;
  } else if (parts.length >= 2) {
    const zone = parts[parts.length - 1];
    const label = parts[0];
    targetUrl = `https://justtld.online/api/site-serve?zone=${encodeURIComponent(zone)}&label=${encodeURIComponent(label)}&root=1&path=%2F`;
  }
  chrome.tabs.update({ url: targetUrl });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'SYNC_NOW') {
    syncRootZones().then(() => sendResponse({ ok: true }));
    return true;
  }
});
