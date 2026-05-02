/**
 * Velox Browser - Overlay Panel Logic
 */
const dom = {};

// Listen for panel toggle messages
window.velox.onPanelToggle((panelId, isOpen) => {
  ['proxy-panel', 'adblock-panel', 'duck-panel'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = (id === panelId && isOpen) ? 'flex' : 'none';
  });
  
  if (isOpen) {
    if (panelId === 'proxy-panel') updateProxyStatus();
    else if (panelId === 'adblock-panel') updateAdBlockStats();
    else if (panelId === 'duck-panel') updateDuckUI();
  }
});

async function updateAdBlockStats() {
  try {
    const s = await window.velox.getAdBlockStats();
    if (dom.statsPanelEl) dom.statsPanelEl.textContent = `${s.blocked || 0} ads blocked`;
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
    if (dom.proxyVal) dom.proxyVal.textContent = s.active ? (s.currentProxy || 'Connected') : 'Disconnected';
    if (dom.proxyDisBtn) dom.proxyDisBtn.style.display = s.active ? 'block' : 'none';
  } catch (e) {}
}

async function updateDuckUI() {
  try {
    const engine = await window.velox.getSearchEngine();
    const isDuck = engine === 'duckduckgo';
    if (dom.engineEl) dom.engineEl.textContent = isDuck ? 'DuckDuckGo' : 'Google';
    if (dom.duckToggleBtn) {
      dom.duckToggleBtn.textContent = isDuck ? 'Disable Private Search' : 'Enable Private Search';
      dom.duckToggleBtn.style.background = isDuck ? 'rgba(239, 68, 68, 0.2)' : 'linear-gradient(135deg, #de5833, #f59e0b)';
      dom.duckToggleBtn.style.color = isDuck ? 'var(--accent-red)' : 'white';
    }
    if (dom.privateBadge) dom.privateBadge.style.display = isDuck ? 'block' : 'none';
  } catch (e) {}
}

// Listeners
const addSafeListener = (id, event, cb) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, cb);
};

addSafeListener('proxy-panel-close', 'click', () => window.velox.closePanels());
addSafeListener('adblock-panel-close', 'click', () => window.velox.closePanels());
addSafeListener('duck-panel-close', 'click', () => window.velox.closePanels());

// Initialize DOM Cache
dom.statsPanelEl = document.getElementById('status-blocked-panel');
dom.adblockToggleBtn = document.getElementById('adblock-toggle-btn');
dom.proxyVal = document.getElementById('proxy-status-value');
dom.proxyDisBtn = document.getElementById('proxy-disconnect');
dom.engineEl = document.getElementById('current-search-engine');
dom.duckToggleBtn = document.getElementById('duck-toggle-btn');
dom.privateBadge = document.getElementById('private-search-badge');
dom.proxyAutoBtn = document.getElementById('proxy-auto');

addSafeListener('adblock-toggle-btn', 'click', async () => {
  await window.velox.toggleAdBlock();
  updateAdBlockStats();
});

addSafeListener('duck-toggle-btn', 'click', async () => {
  const current = await window.velox.getSearchEngine();
  const next = current === 'duckduckgo' ? 'google' : 'duckduckgo';
  await window.velox.setSearchEngine(next);
  updateDuckUI();
});

addSafeListener('proxy-auto', 'click', async () => {
  const btn = document.getElementById('proxy-auto');
  btn.textContent = 'Connecting...';
  await window.velox.autoConnectProxy();
  await updateProxyStatus();
  await updateDuckUI();
  btn.textContent = 'Auto-Connect to Velox';
});

addSafeListener('proxy-disconnect', 'click', async () => {
  await window.velox.disableProxy();
  await updateProxyStatus();
  await updateDuckUI();
});

// Initial stats update
updateAdBlockStats();
updateProxyStatus();
updateDuckUI();
setInterval(updateAdBlockStats, 5000);
setInterval(updateProxyStatus, 5000);
setInterval(updateDuckUI, 5000);
