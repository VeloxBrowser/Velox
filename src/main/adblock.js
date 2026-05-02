const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');

let blocker;
let enabled = true;
let stats = { blocked: 0, session: 0 };

let currentSession;

async function initAdBlocker(ses) {
  currentSession = ses;
  // Polyfill for registerPreloadScript if missing
  if (typeof ses.registerPreloadScript !== 'function') {
    ses.registerPreloadScript = () => {};
  }
  blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  blocker.enableBlockingInSession(ses, { enablePreloads: false }); // Fix registerPreloadScript error

  blocker.on('request-blocked', () => {
    stats.blocked++;
    stats.session++;
  });

  console.log('[Velox AdBlock] Ghostery Engine Initialized');
}

function getStats() {
  return { ...stats, enabled };
}

function isEnabled() {
  return enabled;
}

function toggle() {
  enabled = !enabled;
  if (enabled) {
    if (blocker && currentSession) blocker.enableBlockingInSession(currentSession, { enablePreloads: false });
  } else {
    if (blocker && currentSession) blocker.disableBlockingInSession(currentSession);
  }
  return enabled;
}

module.exports = { initAdBlocker, getStats, isEnabled, toggle };
