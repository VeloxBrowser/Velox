/**
 * Velox Browser - Core UI Logic
 */
const state = {
  tabs: new Map(),
  activeTabId: null,
  proxyPanelOpen: false,
  adblockPanelOpen: false,
  duckPanelOpen: false
};

const dom = {};

// --- Panel Management ---
window.toggleVeloxPanel = (panelId) => {
  console.log('[Velox] Requesting panel toggle:', panelId);
  if (panelId === 'proxy-panel') window.velox.toggleProxyPanel(true);
  else if (panelId === 'adblock-panel') window.velox.toggleAdblockPanel(true);
  else if (panelId === 'duck-panel') window.velox.toggleDuckPanel(true);
};

window.closeAllPanels = () => {
  window.velox.closePanels();
};

// --- Tab Management ---
function createTabElement(data) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tabId = data.id;
  tab.innerHTML = `<img class="tab-favicon" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6' fill='%23555'/></svg>" width="14" height="14"><span class="tab-title">${data.title}</span><span class="tab-close">&times;</span>`;
  tab.addEventListener('click', (e) => {
    if (e.target.closest('.tab-close')) window.velox.closeTab(data.id);
    else window.velox.switchTab(data.id);
  });
  return tab;
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const el = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (el) el.classList.add('active');
  state.activeTabId = tabId;
  const ts = state.tabs.get(tabId);
  if (ts && dom.urlInput) {
    dom.urlInput.value = ts.url?.startsWith('file://') ? 'velox://newtab' : (ts.url || '');
  }
}

async function updateAdBlockStats() {
  try {
    const s = await window.velox.getAdBlockStats();
    const text = `${s.blocked || 0} ads blocked`;
    if (dom.statsEl) dom.statsEl.textContent = text;
    if (dom.statsPanelEl) dom.statsPanelEl.textContent = text;
    if (dom.shieldBtn) dom.shieldBtn.style.color = s.enabled ? 'var(--accent-green)' : 'var(--text-muted)';
    if (dom.adblockToggleBtn) {
      dom.adblockToggleBtn.textContent = s.enabled ? 'Disable AdBlock' : 'Enable AdBlock';
      dom.adblockToggleBtn.style.background = s.enabled ? 'rgba(239, 68, 68, 0.2)' : 'linear-gradient(135deg, #10b981, #06b6d4)';
      dom.adblockToggleBtn.style.color = s.enabled ? 'var(--accent-red)' : 'white';
    }
  } catch (e) {}
}

async function updateProxyStatus() {
  try {
    const s = await window.velox.getProxyStatus();
    if (dom.proxyDot) {
      dom.proxyDot.className = s.active ? 'dot-active' : '';
      if (s.connecting) dom.proxyDot.className = 'dot-connecting';
    }
    
    if (dom.proxyIndicator) dom.proxyIndicator.className = s.active ? 'indicator-on' : 'indicator-off';
    if (dom.statusProxyText) dom.statusProxyText.textContent = s.active ? 'Proxy: Active' : 'Direct';
    if (dom.proxyVal) dom.proxyVal.textContent = s.active ? (s.currentProxy || 'Connected') : 'Disconnected';
    if (dom.proxyDisBtn) dom.proxyDisBtn.style.display = s.active ? 'block' : 'none';
  } catch (e) {}
}

function init() {
  window.velox.onTabCreated((data) => {
    state.tabs.set(data.id, { ...data });
    document.getElementById('tabs-list').appendChild(createTabElement(data));
    setActiveTab(data.id);
  });
  window.velox.onTabClosed((tabId) => {
    state.tabs.delete(tabId);
    const el = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (el) el.remove();
  });
  window.velox.onTabActivated((tabId) => setActiveTab(tabId));
  window.velox.onTabTitleUpdated((tabId, title) => {
    const el = document.querySelector(`.tab[data-tab-id="${tabId}"] .tab-title`);
    if (el) el.textContent = title;
  });
  window.velox.onTabUrlUpdated((tabId, url) => {
    const ts = state.tabs.get(tabId); if (ts) ts.url = url;
    if (tabId === state.activeTabId && dom.urlInput) {
      if (document.activeElement !== dom.urlInput) dom.urlInput.value = url.startsWith('file://') ? 'velox://newtab' : url;
    }
  });

  // Listeners
  const addSafeListener = (id, event, cb) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, cb);
  };

  addSafeListener('new-tab-btn', 'click', () => window.velox.createTab('velox://newtab'));
  addSafeListener('btn-back', 'click', () => window.velox.goBack());
  addSafeListener('btn-forward', 'click', () => window.velox.goForward());
  addSafeListener('btn-reload', 'click', () => window.velox.reload());
  addSafeListener('btn-minimize', 'click', () => window.velox.minimize());
  addSafeListener('btn-maximize', 'click', () => window.velox.maximize());
  addSafeListener('btn-close', 'click', () => window.velox.close());
  
  addSafeListener('btn-duck', 'click', () => window.toggleVeloxPanel('duck-panel'));
  addSafeListener('btn-adblock', 'click', () => window.toggleVeloxPanel('adblock-panel'));
  addSafeListener('btn-proxy', 'click', () => window.toggleVeloxPanel('proxy-panel'));
  addSafeListener('proxy-panel-close', 'click', window.closeAllPanels);
  addSafeListener('adblock-panel-close', 'click', window.closeAllPanels);
  addSafeListener('duck-panel-close', 'click', window.closeAllPanels);
  
  // Cache DOM elements
  dom.urlInput = document.getElementById('url-input');
  dom.statsEl = document.getElementById('status-blocked');
  dom.statsPanelEl = document.getElementById('status-blocked-panel');
  dom.shieldBtn = document.getElementById('btn-shield');
  dom.adblockToggleBtn = document.getElementById('adblock-toggle-btn');
  dom.proxyDot = document.getElementById('proxy-status-dot');
  dom.proxyIndicator = document.getElementById('proxy-indicator');
  dom.statusProxyText = document.getElementById('status-proxy-text');
  dom.proxyVal = document.getElementById('proxy-status-value');
  dom.proxyDisBtn = document.getElementById('proxy-disconnect');
  dom.tabsList = document.getElementById('tabs-list');

  addSafeListener('adblock-toggle-btn', 'click', async () => {
    await window.velox.toggleAdBlock();
    updateAdBlockStats();
  });

  addSafeListener('proxy-auto', 'click', async () => {
    const btn = document.getElementById('proxy-auto');
    btn.textContent = 'Connecting...';
    await window.velox.autoConnectProxy();
    await updateProxyStatus();
    btn.textContent = 'Auto-Connect to Velox';
  });

  addSafeListener('proxy-disconnect', 'click', async () => {
    await window.velox.disableProxy();
    await updateProxyStatus();
  });

  const urlInput = document.getElementById('url-input');
  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { window.velox.navigate(urlInput.value.trim()); urlInput.blur(); }
    });
    urlInput.addEventListener('focus', () => {
      if (urlInput.value === 'velox://newtab') {
        urlInput.value = '';
      } else {
        urlInput.select();
      }
    });
  }

  updateAdBlockStats();
  updateProxyStatus();
  setInterval(updateAdBlockStats, 5000);
  setInterval(updateProxyStatus, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
