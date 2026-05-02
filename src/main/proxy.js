/**
 * Velox Proxy Manager
 * Tor Network Integration
 */

const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProxyManager {
  constructor(session) {
    this.session = session;
    this.active = false;
    this.connecting = false;
    this.currentProxy = null;
    this.torProcess = null;
    
    // Ensure Tor data dir exists
    this.torDataDir = path.join(app.getPath('userData'), 'tor-data');
    if (!fs.existsSync(this.torDataDir)) {
      fs.mkdirSync(this.torDataDir, { recursive: true });
    }
  }

  async startTor() {
    if (this.torProcess) return { success: true, proxy: 'socks5://127.0.0.1:9050' };
    this.connecting = true;

    return new Promise((resolve, reject) => {
      try {
        const torPath = app.isPackaged 
          ? path.join(process.resourcesPath, 'tor', 'tor.exe') 
          : path.join(__dirname, '../../assets/tor/tor.exe');

        console.log('[Velox Tor] Starting Tor from:', torPath);

        this.torProcess = spawn(torPath, [
          '--DataDirectory', this.torDataDir,
          '--SocksPort', '9050'
        ]);

        let isReady = false;

        this.torProcess.stdout.on('data', (data) => {
          const output = data.toString();
          // console.log('[Tor]', output.trim());
          if (output.includes('Bootstrapped 100%') && !isReady) {
            isReady = true;
            this.active = true;
            this.connecting = false;
            this.currentProxy = 'socks5://127.0.0.1:9050';
            this.session.setProxy({ proxyRules: this.currentProxy });
            console.log('[Velox Tor] Connected successfully!');
            resolve({ success: true, proxy: this.currentProxy });
          }
        });

        this.torProcess.stderr.on('data', (data) => {
          console.error('[Tor Error]', data.toString().trim());
        });

        this.torProcess.on('close', (code) => {
          console.log('[Velox Tor] Tor process exited with code', code);
          this.active = false;
          this.connecting = false;
          this.currentProxy = null;
          this.torProcess = null;
        });
        
        // Timeout if Tor takes too long to bootstrap
        setTimeout(() => {
          if (!isReady) {
            this.connecting = false;
            resolve({ success: false, error: 'Tor bootstrap timeout' });
          }
        }, 45000);

      } catch (err) {
        console.error('[Velox Tor] Failed to start:', err);
        resolve({ success: false, error: err.message });
      }
    });
  }

  async setProxy(proxyString) {
    try {
      await this.session.setProxy({ proxyRules: proxyString });
      this.active = true;
      this.currentProxy = proxyString;
      return { success: true, proxy: proxyString };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async disable() {
    if (this.torProcess) {
      this.torProcess.kill();
      this.torProcess = null;
    }
    try {
      await this.session.setProxy({ proxyRules: '' });
      this.active = false;
      this.currentProxy = null;
      console.log('[Velox Tor] Disconnected');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStatus() {
    return {
      active: this.active,
      connecting: this.connecting,
      currentProxy: this.currentProxy,
      availableProxies: 1, // Representing Tor
    };
  }

  async rotateProxy() {
    return this.startTor();
  }
}

module.exports = { ProxyManager };
