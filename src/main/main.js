const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

app.disableHardwareAcceleration();

app.name = 'Velox';
app.commandLine.appendSwitch('background-color', '#08080c');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-metrics-repo');
app.commandLine.appendSwitch('no-sandbox');

const { initAdBlocker, getStats, isEnabled: isAdBlockEnabled, toggle: toggleAdBlock } = require('./adblock');
const { ProxyManager } = require('./proxy');
const { applyPrivacyProtections } = require('./privacy');

nativeTheme.themeSource = 'dark';

let mainWindow = null;
let panelWindow = null;
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
let proxyManager = null;
let searchEngine = 'google';

const TOOLBAR_HEIGHT = 94;
const STATUSBAR_HEIGHT = 32;
const VIEW_BG = '#08080c';

const PATHS = {
  mainPreload: path.join(__dirname, '../preload/preload.js'),
  contentPreload: path.join(__dirname, '../preload/content-preload.js'),
  indexHtml: path.join(__dirname, '../renderer/index.html'),
  panelsHtml: path.join(__dirname, '../renderer/panels.html'),
  newTabHtml: path.join(__dirname, '../renderer/newtab.html'),
  icon: path.join(__dirname, '../../assets/icon.png'),
};

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
  } catch (_) {}

  app.on('web-contents-created', (_event, contents) => {
    try {
      contents.setWindowOpenHandler(({ url }) => {
        const targetUrl = String(url || '').trim();

        if (!targetUrl || targetUrl === 'about:blank' || targetUrl.startsWith('javascript:')) {
          return { action: 'deny' };
        }

        if (/^https?:\/\//i.test(targetUrl)) {
          setImmediate(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              createTab(targetUrl);
            }
          });
        }

        return { action: 'deny' };
      });
    } catch (_) {}

    contents.on('did-create-window', (childWindow, details) => {
      try {
        if (childWindow && !childWindow.isDestroyed()) childWindow.hide();
      } catch (_) {}

      try {
        if (childWindow && !childWindow.isDestroyed()) childWindow.destroy();
      } catch (_) {}

      const targetUrl = String(details?.url || '').trim();
      if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
        setImmediate(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            createTab(targetUrl);
          }
        });
      }
    });
  });

  proxyManager = new ProxyManager(session.defaultSession);

  createMainWindow();

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.error('AutoUpdater Error:', err);
  }

  initAdBlocker(session.defaultSession).catch((err) => {
    console.error('AdBlock Init Error:', err);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (tabs.size === 0) {
      createTab('velox://newtab');
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async () => {
  try {
    if (proxyManager) {
      await proxyManager.disable();
    }
  } catch (_) {}
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: VIEW_BG,
    show: false,
    icon: PATHS.icon,
    title: 'Velox Browser',
    webPreferences: {
      preload: PATHS.mainPreload,
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(PATHS.indexHtml);

  mainWindow.once('ready-to-show', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    } catch (_) {}
  });

  createPanelWindow();

  mainWindow.on('resize', () => {
    updateActiveTabBounds();
    repositionPanelWindow();
  });

  mainWindow.on('move', () => {
    repositionPanelWindow();
  });

  mainWindow.on('maximize', () => {
    safeSend('window-maximized', true);
    updateActiveTabBounds();
    repositionPanelWindow();
  });

  mainWindow.on('unmaximize', () => {
    safeSend('window-maximized', false);
    updateActiveTabBounds();
    repositionPanelWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PATHS.mainPreload,
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  panelWindow.loadFile(PATHS.panelsHtml);

  panelWindow.on('closed', () => {
    panelWindow = null;
  });
}

function repositionPanelWindow() {
  if (!panelWindow || !mainWindow || panelWindow.isDestroyed() || mainWindow.isDestroyed()) return;

  try {
    const [x, y] = mainWindow.getPosition();
    const [width] = mainWindow.getSize();
    panelWindow.setPosition(x + width - 350, y + TOOLBAR_HEIGHT);
  } catch (_) {}
}

function getViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: TOOLBAR_HEIGHT, width: 0, height: 0 };
  }

  const { width, height } = mainWindow.getContentBounds();

  return {
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT - STATUSBAR_HEIGHT),
  };
}

function createTab(url = 'velox://newtab') {
  const tabId = nextTabId++;

  const view = new BrowserView({
    webPreferences: {
      preload: PATHS.contentPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });

  try {
    if (typeof view.setBackgroundColor === 'function') {
      view.setBackgroundColor(VIEW_BG);
    }
  } catch (_) {}

  try {
    view.setBounds(getViewBounds());
    view.setAutoResize({ width: true, height: true });
  } catch (_) {}

  applyPrivacyProtections(view.webContents);

  try {
    view.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  } catch (_) {}

  const tab = {
    id: tabId,
    view,
    title: 'New Tab',
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };

  tabs.set(tabId, tab);

  view.webContents.on('did-start-loading', () => {
    tab.isLoading = true;
    safeSend('tab-loading', tabId, true);
  });

  view.webContents.on('dom-ready', () => {
    updateActiveTabBounds();
  });

  view.webContents.on('did-frame-finish-load', () => {
    updateActiveTabBounds();
  });

  view.webContents.on('did-stop-loading', () => {
    tab.isLoading = false;
    tab.canGoBack = safeCanGoBack(view.webContents);
    tab.canGoForward = safeCanGoForward(view.webContents);

    safeSend('tab-loading', tabId, false);
    safeSend('tab-nav-state', tabId, {
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
    });

    updateActiveTabBounds();
  });

  view.webContents.on('page-title-updated', (_, title) => {
    tab.title = title || 'New Tab';
    safeSend('tab-title-updated', tabId, tab.title);
  });

  view.webContents.on('did-navigate', (_, navUrl) => {
    tab.url = navUrl;
    safeSend('tab-url-updated', tabId, navUrl);
    updateActiveTabBounds();
  });

  view.webContents.on('did-navigate-in-page', (_, navUrl) => {
    tab.url = navUrl;
    safeSend('tab-url-updated', tabId, navUrl);
    updateActiveTabBounds();
  });

  view.webContents.on('page-favicon-updated', (_, favicons) => {
    if (Array.isArray(favicons) && favicons.length > 0) {
      safeSend('tab-favicon-updated', tabId, favicons[0]);
    }
  });

  try {
    view.webContents.setBackgroundThrottling(false);
  } catch (_) {}

  switchToTab(tabId);
  navigateView(view, url);

  safeSend('tab-created', {
    id: tabId,
    title: tab.title,
    url: tab.url,
  });

  return tabId;
}

function navigateView(view, url) {
  if (!view || !view.webContents || view.webContents.isDestroyed()) return;

  try {
    if (url === 'velox://newtab') {
      view.webContents.loadFile(PATHS.newTabHtml);
    } else {
      view.webContents.loadURL(url);
    }
  } catch (err) {
    console.error('Navigation Error:', err);
  }
}

function switchToTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || !mainWindow || mainWindow.isDestroyed()) return;

  try {
    mainWindow.setBrowserView(tab.view);
    activeTabId = tabId;
    updateActiveTabBounds();
    safeSend('tab-activated', tabId);
  } catch (err) {
    console.error('Switch Tab Error:', err);
  }
}

function updateActiveTabBounds() {
  if (activeTabId === null || !mainWindow || mainWindow.isDestroyed()) return;

  const tab = tabs.get(activeTabId);
  if (!tab) return;

  try {
    tab.view.setBounds(getViewBounds());
  } catch (_) {}
}

function closeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  const wasActive = activeTabId === tabId;

  if (wasActive && mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setBrowserView(null);
    } catch (_) {}
  }

  try {
    if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.stop();
      tab.view.webContents.close();
    }
  } catch (_) {}

  tabs.delete(tabId);
  safeSend('tab-closed', tabId);

  if (wasActive) {
    const remaining = [...tabs.keys()];
    if (remaining.length > 0) {
      switchToTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
    }
  }

  if (tabs.size === 0) {
    createTab('velox://newtab');
  }
}

function togglePanel(panelId, isOpen) {
  if (!panelWindow || panelWindow.isDestroyed()) return;

  try {
    if (isOpen) {
      repositionPanelWindow();
      panelWindow.show();
      panelWindow.webContents.send('panel-toggle', panelId, true);
    } else {
      panelWindow.hide();
    }
  } catch (_) {}
}

function safeSend(channel, ...args) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch (_) {}
}

function safeCanGoBack(webContents) {
  try {
    return !!webContents?.navigationHistory?.canGoBack?.();
  } catch (_) {
    return false;
  }
}

function safeCanGoForward(webContents) {
  try {
    return !!webContents?.navigationHistory?.canGoForward?.();
  } catch (_) {
    return false;
  }
}

async function safeProxyCall(methodName, ...args) {
  try {
    if (!proxyManager || typeof proxyManager[methodName] !== 'function') {
      return { success: false, error: `${methodName} is not implemented` };
    }
    return await proxyManager[methodName](...args);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

ipcMain.handle('create-tab', (_, url) => createTab(url));
ipcMain.handle('close-tab', (_, tabId) => closeTab(tabId));
ipcMain.handle('switch-tab', (_, tabId) => switchToTab(tabId));

ipcMain.handle('navigate', (_, input) => {
  if (activeTabId === null) return;

  const tab = tabs.get(activeTabId);
  if (!tab) return;

  let url = String(input || '').trim();
  if (!url) return;

  if (url === 'velox://newtab') {
    navigateView(tab.view, url);
    return;
  }

  const isUrl = /^(https?:\/\/|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/.test(url);

  if (!isUrl) {
    url = searchEngine === 'duckduckgo'
      ? `https://duckduckgo.com/?q=${encodeURIComponent(url)}`
      : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
  } else if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  navigateView(tab.view, url);
});

ipcMain.handle('go-back', () => {
  const tab = tabs.get(activeTabId);
  try {
    if (safeCanGoBack(tab?.view?.webContents)) {
      tab.view.webContents.navigationHistory.goBack();
    }
  } catch (_) {}
});

ipcMain.handle('go-forward', () => {
  const tab = tabs.get(activeTabId);
  try {
    if (safeCanGoForward(tab?.view?.webContents)) {
      tab.view.webContents.navigationHistory.goForward();
    }
  } catch (_) {}
});

ipcMain.handle('reload', () => {
  const tab = tabs.get(activeTabId);
  try {
    if (tab?.view?.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.reload();
    }
  } catch (_) {}
});

ipcMain.handle('stop-loading', () => {
  const tab = tabs.get(activeTabId);
  try {
    if (tab?.view?.webContents && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.stop();
    }
  } catch (_) {}
});

ipcMain.handle('window-minimize', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  } catch (_) {}
});

ipcMain.handle('window-maximize', () => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  } catch (_) {}
});

ipcMain.handle('window-close', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  } catch (_) {}
});

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
  try {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.hide();
    }
  } catch (_) {}
});

ipcMain.handle('get-adblock-stats', () => getStats());
ipcMain.handle('toggle-adblock', () => toggleAdBlock());
ipcMain.handle('is-adblock-enabled', () => isAdBlockEnabled());

ipcMain.handle('get-proxy-status', () => {
  try {
    if (!proxyManager) {
      return {
        active: false,
        connecting: false,
        currentProxy: null,
        availableProxies: 0,
      };
    }
    return proxyManager.getStatus();
  } catch (_) {
    return {
      active: false,
      connecting: false,
      currentProxy: null,
      availableProxies: 0,
    };
  }
});

ipcMain.handle('set-proxy', (_, proxy) => safeProxyCall('setProxy', proxy));

ipcMain.handle('disable-proxy', async () => {
  searchEngine = 'google';
  return safeProxyCall('disable');
});

ipcMain.handle('fetch-free-proxies', async () => {
  return safeProxyCall('fetchFreeProxies');
});

ipcMain.handle('test-proxy', async (_, proxy) => {
  return safeProxyCall('testProxy', proxy);
});

ipcMain.handle('auto-connect-proxy', async () => {
  searchEngine = 'duckduckgo';
  return safeProxyCall('rotateProxy');
});

ipcMain.handle('set-search-engine', (_, engine) => {
  searchEngine = engine === 'duckduckgo' ? 'duckduckgo' : 'google';
});

ipcMain.handle('get-search-engine', () => {
  return searchEngine;
});