/**
 * Velox Privacy Protections
 * WebRTC leak prevention, fingerprint protection, user-agent rotation
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function applyPrivacyProtections(webContents) {
  // Set random user agent
  webContents.setUserAgent(getRandomUA());

  // Inject privacy scripts when DOM is ready
  webContents.on('dom-ready', () => {
    // WebRTC leak prevention
    webContents.executeJavaScript(`
      // Block WebRTC IP leak
      if (window.RTCPeerConnection) {
        const origRTC = window.RTCPeerConnection;
        window.RTCPeerConnection = function(config, constraints) {
          if (config && config.iceServers) {
            config.iceServers = [];
          }
          return new origRTC(config, constraints);
        };
        window.RTCPeerConnection.prototype = origRTC.prototype;
      }

      // Prevent canvas fingerprinting
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] ^= 1;
          }
          ctx.putImageData(imageData, 0, 0);
        }
        const result = origToDataURL.apply(this, arguments);
        return result;
      };

      // Spoof navigator properties
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

      // Block battery API fingerprinting
      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.reject('Not supported');
      }
    `).catch(() => {});

    // Anti-adblock detection bypass
    webContents.executeJavaScript(`
      // Fool ad-blocker detection scripts
      // Create fake ad elements that detectors look for
      const baitDiv = document.createElement('div');
      baitDiv.className = 'ad-banner ads adsbox ad-placement';
      baitDiv.id = 'ad-container';
      baitDiv.style.cssText = 'position:absolute!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;';
      baitDiv.innerHTML = '<div class="ad" style="width:1px;height:1px;"></div>';
      document.body.appendChild(baitDiv);

      // Override common adblock detection methods
      Object.defineProperty(baitDiv, 'offsetHeight', { get: () => 250 });
      Object.defineProperty(baitDiv, 'offsetWidth', { get: () => 300 });
      Object.defineProperty(baitDiv, 'clientHeight', { get: () => 250 });
      Object.defineProperty(baitDiv, 'clientWidth', { get: () => 300 });

      // Intercept common detection variable names
      window.canRunAds = true;
      window.adBlockEnabled = false;
      window.adblockDetected = false;
      window.__AD_BLOCKER_DETECTED__ = false;

      // Neutralize MutationObserver-based detection
      const origObserve = MutationObserver.prototype.observe;
      MutationObserver.prototype.observe = function(target, config) {
        if (target && target.classList &&
            (target.classList.contains('ad') ||
             target.classList.contains('ads') ||
             target.id === 'ad-container')) {
          return; // Don't observe bait elements
        }
        return origObserve.apply(this, arguments);
      };
    `).catch(() => {});
  });
}

module.exports = { applyPrivacyProtections, getRandomUA };
