const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
app.name = 'Velox';
app.commandLine.appendSwitch('background-color', '#08080c');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-metrics-repo');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox'); // High speed, low overhead (use with caution in untrusted environments)
const { initAdBlocker, getStats, isEnabled: isAdBlockEnabled, toggle: toggleAdBlock } = require('./adblock');
const { ProxyManager } = require('./proxy');
const { applyPrivacyProtections } = require('./privacy');

// Force dark mode
nativeTheme.themeSource = 'dark';

let mainWindow;
let panelWindow;
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
let proxyManager;

const TOOLBAR_HEIGHT = 94; // 42 (title) + 52 (nav)
const STATUSBAR_HEIGHT = 32;

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Init proxy manager
  proxyManager = new ProxyManager(session.defaultSession);

  createMainWindow();
  autoUpdater.checkForUpdatesAndNotify();

  // Init ad blocker in background
  initAdBlocker(session.defaultSession).catch(err => console.error('AdBlock Init Error:', err));
  
  mainWindow.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) {
      createTab('velox://newtab');
    }
  });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (proxyManager) {
    proxyManager.disable();
  }
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#08080c',
    show: true,
    icon: path.join(__dirname, '../../assets/icon.png'),
    title: 'Velox Browser',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  createPanelWindow();

  mainWindow.on('resize', () => {
    updateActiveTabBounds();
    repositionPanelWindow();
  });
  mainWindow.on('move', () => {
    repositionPanelWindow();
  });
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
    updateActiveTabBounds();
    repositionPanelWindow();
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
    updateActiveTabBounds();
    repositionPanelWindow();
  });
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 350,
    height: 600,
    parent: mainWindow,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  panelWindow.loadFile(path.join(__dirname, '../renderer/panels.html'));
}

function repositionPanelWindow() {
  if (!panelWindow || !mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const [width, height] = mainWindow.getSize();
  panelWindow.setPosition(x + width - 350, y + TOOLBAR_HEIGHT);
}

function createTab(url) {
  const tabId = nextTabId++;
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/content-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    backgroundColor: '#08080c'
  });

  const [winW, winH] = mainWindow.getSize();
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  view.setAutoResize({ width: true, height: true });

  view.webContents.on('did-start-navigation', () => {
    view.webContents.insertCSS('html, body { background: #08080c !important; }');
    updateActiveTabBounds();
    setTimeout(() => updateActiveTabBounds(), 50);
  });

  view.webContents.on('did-navigate', () => {
    updateActiveTabBounds();
    setTimeout(() => updateActiveTabBounds(), 100);
  });

  view.webContents.on('did-frame-finish-load', () => {
    updateActiveTabBounds();
  });

  applyPrivacyProtections(view.webContents);
  
  // Set normal Chrome User Agent to bypass captchas (Tor default can trigger Cloudflare/Google blocks)
  view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const tab = {
    id: tabId,
    view,
    title: 'New Tab',
    url: url || 'velox://newtab',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };

  tabs.set(tabId, tab);

  view.webContents.on('did-start-loading', () => {
    tab.isLoading = true;
    safeSend('tab-loading', tabId, true);
  });

  view.webContents.on('did-stop-loading', () => {
    tab.isLoading = false;
    tab.canGoBack = view.webContents.navigationHistory.canGoBack();
    tab.canGoForward = view.webContents.navigationHistory.canGoForward();
    safeSend('tab-loading', tabId, false);
    safeSend('tab-nav-state', tabId, { canGoBack: tab.canGoBack, canGoForward: tab.canGoForward });
  });

  view.webContents.on('page-title-updated', (_, title) => {
    tab.title = title;
    safeSend('tab-title-updated', tabId, title);
  });

  view.webContents.on('did-navigate', (_, navUrl) => {
    tab.url = navUrl;
    safeSend('tab-url-updated', tabId, navUrl);
  });

  view.webContents.on('did-navigate-in-page', (_, navUrl) => {
    tab.url = navUrl;
    safeSend('tab-url-updated', tabId, navUrl);
  });

  view.webContents.on('page-favicon-updated', (_, favicons) => {
    if (favicons.length > 0) {
      safeSend('tab-favicon-updated', tabId, favicons[0]);
    }
  });

  // Handle new window requests (target=_blank) - open in new tab
  view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    createTab(newUrl);
    return { action: 'deny' };
  });

  // Optimize performance: Disable background throttling for active views
  view.webContents.setBackgroundThrottling(false);

  switchToTab(tabId);
  navigateView(view, url || 'velox://newtab');

  safeSend('tab-created', { id: tabId, title: tab.title, url: tab.url });
  return tabId;
}

function navigateView(view, url) {
  if (url === 'velox://newtab') {
    view.webContents.loadFile(path.join(__dirname, '../renderer/newtab.html'));
  } else {
    view.webContents.loadURL(url);
  }
}

function switchToTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  mainWindow.setBrowserView(tab.view);
  activeTabId = tabId;
  updateActiveTabBounds();
  safeSend('tab-activated', tabId);
}

let isProxyPanelOpen = false;
let isAdblockPanelOpen = false;
let isDuckPanelOpen = false;
let searchEngine = 'google';

function updateActiveTabBounds() {
  if (!activeTabId || !mainWindow) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;

  const { width, height } = mainWindow.getContentBounds();
  
  tab.view.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: width,
    height: height - TOOLBAR_HEIGHT - STATUSBAR_HEIGHT,
  });
}

ipcMain.handle('toggle-proxy-panel', (_, isOpen) => {
  togglePanel('proxy-panel', isOpen);
});

ipcMain.handle('toggle-adblock-panel', (_, isOpen) => {
  togglePanel('adblock-panel', isOpen);
});

ipcMain.handle('toggle-duck-panel', (_, isOpen) => {
  togglePanel('duck-panel', isOpen);
});

ipcMain.handle('close-all-panels', () => {
  if (panelWindow) panelWindow.hide();
});

function togglePanel(panelId, isOpen) {
  if (!panelWindow) return;
  if (isOpen) {
    repositionPanelWindow();
    panelWindow.show();
    panelWindow.webContents.send('panel-toggle', panelId, true);
  } else {
    panelWindow.hide();
  }
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  // Strict cleanup for RAM optimization
  tab.view.webContents.stop();
  tab.view.webContents.close();
  
  if (activeTabId === tabId) {
    mainWindow.setBrowserView(null);
    const remaining = [...tabs.keys()].filter(id => id !== tabId);
    if (remaining.length > 0) {
      switchToTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
    }
  }

  tab.view.webContents.close();
  tabs.delete(tabId);
  safeSend('tab-closed', tabId);

  if (tabs.size === 0) {
    createTab('velox://newtab');
  }
}

function safeSend(channel, ...args) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch (_) {}
}

// ===== IPC HANDLERS =====
ipcMain.handle('create-tab', (_, url) => createTab(url));
ipcMain.handle('close-tab', (_, tabId) => closeTab(tabId));
ipcMain.handle('switch-tab', (_, tabId) => switchToTab(tabId));

ipcMain.handle('navigate', (_, url) => {
  if (activeTabId === null) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;

  if (url === 'velox://newtab') {
    navigateView(tab.view, url);
    return;
  }

  // Detect search vs URL
  const isUrl = /^(https?:\/\/|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/.test(url);
  if (!isUrl) {
    if (searchEngine === 'duckduckgo') {
      url = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
  } else if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  tab.view.webContents.loadURL(url);
});

ipcMain.handle('go-back', () => {
  const tab = tabs.get(activeTabId);
  if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
});

ipcMain.handle('go-forward', () => {
  const tab = tabs.get(activeTabId);
  if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
});

ipcMain.handle('reload', () => {
  const tab = tabs.get(activeTabId);
  if (tab) tab.view.webContents.reload();
});

ipcMain.handle('stop-loading', () => {
  const tab = tabs.get(activeTabId);
  if (tab) tab.view.webContents.stop();
});

// Window controls
ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow.close());

// Ad blocker
ipcMain.handle('get-adblock-stats', () => getStats());
ipcMain.handle('toggle-adblock', () => toggleAdBlock());
ipcMain.handle('is-adblock-enabled', () => isAdBlockEnabled());

// Proxy
ipcMain.handle('get-proxy-status', () => proxyManager.getStatus());
ipcMain.handle('set-proxy', (_, proxy) => proxyManager.setProxy(proxy));
ipcMain.handle('disable-proxy', () => {
  searchEngine = 'google';
  return proxyManager.disable();
});
ipcMain.handle('fetch-free-proxies', () => proxyManager.fetchFreeProxies());
ipcMain.handle('test-proxy', (_, proxy) => proxyManager.testProxy(proxy));
ipcMain.handle('auto-connect-proxy', async () => {
  searchEngine = 'duckduckgo';
  return proxyManager.rotateProxy();
});

ipcMain.handle('set-search-engine', (_, engine) => {
  searchEngine = engine;
});

ipcMain.handle('get-search-engine', () => {
  return searchEngine;
});
