/* Served ONLY by performance-server.mjs, never imported into the app. */
(() => {
  // Fix the service clock so timetable choices stay identical across before/after runs.
  const RealDate = Date;
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-09-16T01:00:00Z'])); }
    static now() { return new RealDate('2026-09-16T01:00:00Z').getTime(); }
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    watchPosition(success) {
      queueMicrotask(() => success({ coords: { latitude: 35.9105, longitude: -79.0478, accuracy: 10 } }));
      return 1;
    }, clearWatch() {},
  } });
  const results = [];
  const pending = new Map();
  let output;
  function record(label, start) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      results.push({ action: label, ms: Math.round((performance.now() - start) * 10) / 10 });
      output.textContent = JSON.stringify(results);
    }));
  }
  const checks = {
    'Home ready': () => document.querySelector('.home-bus-row'),
    'Search open': () => document.querySelector('.ss-field input'),
    'Nearest stops': () => document.querySelector('.ss-stop'),
    'Trip results': () => document.querySelector('.trip-options'),
    'Bus details': () => document.querySelector('.bus-detail-sheet'),
    'Map open': () => document.querySelector('.campus-toolbar'),
    'Home return': () => document.querySelector('.home-content'),
    'Map options': () => document.querySelector('.campus-options'),
    'Browse stops': () => document.querySelector('.campus-picker'),
    'Refresh complete': () => !document.querySelector('.home-refresh')?.disabled,
  };
  document.addEventListener('DOMContentLoaded', () => {
    output = document.createElement('output'); output.id = 'benchmark-results';
    // Readable via the DOM for automation; opt in to a visible panel with ?metrics.
    output.style.cssText = 'position:fixed;bottom:60px;left:0;right:0;z-index:9999;background:white;font:11px monospace;pointer-events:none;max-height:100px;overflow:auto;';
    output.hidden = !new URLSearchParams(location.search).has('metrics');
    document.body.appendChild(output);
    pending.set('Home ready', 0);
    new MutationObserver(() => {
      for (const [label, start] of pending) if (checks[label]()) { pending.delete(label); record(label, start); }
    }).observe(document.getElementById('root'), { childList: true, subtree: true, attributes: true });
    // Portals (search/trip and bus details) live outside #root.
    new MutationObserver(() => {
      for (const [label, start] of pending) if (checks[label]()) { pending.delete(label); record(label, start); }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      const label = button.matches('.home-search,.home-save-place') ? 'Search open'
        : button.matches('.home-bus-row') ? 'Bus details'
        : button.matches('.ss-row-main') ? 'Trip results'
        : button.matches('.home-refresh') ? 'Refresh complete'
        : button.textContent.trim() === 'Nearest stops' ? 'Nearest stops'
        : button.closest('.passenger-nav') ? (button.textContent.trim() === 'Map' ? 'Map open' : 'Home return')
        : button.getAttribute('aria-label') === 'Map options' ? 'Map options'
        : button.textContent.includes('Browse stops') ? 'Browse stops' : null;
      if (label) pending.set(label, performance.now());
    }, true);
  });
})();
