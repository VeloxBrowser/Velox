const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('velox', {
  // Tab management
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('switch-tab', tabId),

  // Navigation
  navigate: (url) => ipcRenderer.invoke('navigate', url),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  stopLoading: () => ipcRenderer.invoke('stop-loading'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // Ad blocker
  getAdBlockStats: () => ipcRenderer.invoke('get-adblock-stats'),
  toggleAdBlock: () => ipcRenderer.invoke('toggle-adblock'),
  isAdBlockEnabled: () => ipcRenderer.invoke('is-adblock-enabled'),

  // Proxy
  getProxyStatus: () => ipcRenderer.invoke('get-proxy-status'),
  setProxy: (proxy) => ipcRenderer.invoke('set-proxy', proxy),
  disableProxy: () => ipcRenderer.invoke('disable-proxy'),
  fetchFreeProxies: () => ipcRenderer.invoke('fetch-free-proxies'),
  testProxy: (proxy) => ipcRenderer.invoke('test-proxy', proxy),
  autoConnectProxy: () => ipcRenderer.invoke('auto-connect-proxy'),
  toggleProxyPanel: (isOpen) => ipcRenderer.invoke('toggle-proxy-panel', isOpen),
  toggleAdblockPanel: (isOpen) => ipcRenderer.invoke('toggle-adblock-panel', isOpen),
  toggleDuckPanel: (isOpen) => ipcRenderer.invoke('toggle-duck-panel', isOpen),
  closePanels: () => ipcRenderer.invoke('close-all-panels'),
  setSearchEngine: (engine) => ipcRenderer.invoke('set-search-engine', engine),
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),

  // Events
  onPanelToggle: (cb) => ipcRenderer.on('panel-toggle', (_, panelId, isOpen) => cb(panelId, isOpen)),
  onTabCreated: (cb) => ipcRenderer.on('tab-created', (_, data) => cb(data)),
  onTabClosed: (cb) => ipcRenderer.on('tab-closed', (_, tabId) => cb(tabId)),
  onTabActivated: (cb) => ipcRenderer.on('tab-activated', (_, tabId) => cb(tabId)),
  onTabTitleUpdated: (cb) => ipcRenderer.on('tab-title-updated', (_, tabId, title) => cb(tabId, title)),
  onTabUrlUpdated: (cb) => ipcRenderer.on('tab-url-updated', (_, tabId, url) => cb(tabId, url)),
  onTabLoading: (cb) => ipcRenderer.on('tab-loading', (_, tabId, isLoading) => cb(tabId, isLoading)),
  onTabNavState: (cb) => ipcRenderer.on('tab-nav-state', (_, tabId, state) => cb(tabId, state)),
  onTabFaviconUpdated: (cb) => ipcRenderer.on('tab-favicon-updated', (_, tabId, favicon) => cb(tabId, favicon)),
  onWindowMaximized: (cb) => ipcRenderer.on('window-maximized', (_, isMax) => cb(isMax)),
});
