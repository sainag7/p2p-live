/* Local diagnostic instrumentation only; excluded from the production app. */
(() => {
  const events = [], requests = [], longTasks = [];
  let output, inputAt = 0;
  const pending = [];
  const publish = () => { if (output) { output.textContent = JSON.stringify({ events, requests, longTasks }); output.setAttribute('data-geocode-count', requests.filter(r => r.pathname === '/api/mapbox/geocode').length); output.setAttribute('data-address-ready-count', events.filter(e => e.action === 'Address search complete' && e.stage === 'DOM ready').length); } };
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const start = performance.now();
    const pathname = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, location.href).pathname;
    try { const response = await originalFetch(...args); requests.push({ pathname, startMs: +start.toFixed(1), ms: +(performance.now() - start).toFixed(1), status: response.status }); publish(); return response; }
    catch (error) { requests.push({ pathname, ms: +(performance.now() - start).toFixed(1), error: error.name }); publish(); throw error; }
  };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) {
    if (entry.duration >= 50) longTasks.push({ startMs: +entry.startTime.toFixed(1), durationMs: +entry.duration.toFixed(1) });
  } publish(); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver(list => { for (const entry of list.getEntries()) {
    const pathname = new URL(entry.name).pathname;
    if (/MapboxMap-/.test(pathname)) { requests.push({ pathname, ms: +entry.duration.toFixed(1), transferBytes: entry.transferSize }); publish(); }
  } }).observe({ type: 'resource', buffered: true });
  function watch(action, ready, scope, start = performance.now()) { pending.push({ action, ready, scope, start, found: false }); }
  function tick() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      if (performance.now() - item.start > 20000) { events.push({ action: item.action, timedOut: true }); pending.splice(i,1); continue; }
      if (!item.found && !item.ready()) continue;
      if (!item.found) { item.found = true; item.element = item.scope?.(); events.push({ action: item.action, stage: 'DOM ready', ms: +(performance.now() - item.start).toFixed(1) }); }
      const scope = item.element;
      const animations = scope?.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity) || [];
      if (animations.length) continue;
      events.push({ action: item.action, stage: 'Animation settled', ms: +(performance.now() - item.start).toFixed(1) }); pending.splice(i,1);
    }
    publish(); requestAnimationFrame(tick);
  }
  document.addEventListener('DOMContentLoaded', () => {
    output = document.createElement('output'); output.id = 'e2e-observations'; output.hidden = true; document.body.appendChild(output);
    watch('Home bus data', () => document.querySelector('.home-bus-row'), () => document.querySelector('.home-content'), 0);
    requestAnimationFrame(tick);
    document.addEventListener('input', event => {
      if (!event.target.matches('.ss-field input')) return;
      inputAt = performance.now();
      if (event.target.value.trim().length >= 3) {
        const start = inputAt;
        watch('Address search complete', () => document.querySelector('.ss-section')?.getAttribute('aria-label') === 'Addresses'
          && document.querySelector('.ss-row')?.textContent.includes('Example Market')
          && !document.querySelector('.ss-note')?.textContent.includes('Searching'),
          () => document.querySelector('.ss-pane'), start);
      }
    }, true);
    document.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.matches('.home-search,.home-save-place')) watch('Search', () => document.querySelector('.ss-field input'), () => document.querySelector('.ss-root'));
      if (button.matches('.ss-row-main')) {
        watch('Trip planning', () => document.querySelector('.trip-options'), () => document.querySelector('.ss-root'));
        watch('Complete trip options', () => document.querySelector('.trip-results[data-bus-pending="false"]'), () => document.querySelector('.ss-root'));
      }
      if (button.matches('.trip-refresh')) watch('Trip refresh', () => !document.querySelector('.trip-refresh')?.disabled, () => document.querySelector('.trip-results'));
      if (button.matches('.trip-option')) watch('Trip mode', () => button.getAttribute('aria-pressed') === 'true', () => document.querySelector('.ss-root'));
      if (button.matches('.ss-star')) { const previous = button.getAttribute('aria-pressed'); watch('Save place', () => button.getAttribute('aria-pressed') !== previous, () => button); }
      if (button.matches('.trip-start')) watch('Start journey', () => document.querySelector('[aria-label="Active journey"]') && !document.querySelector('.ss-root'), () => document.querySelector('.campus-sheet'));
      if (button.closest('.passenger-nav') && button.textContent.trim() === 'Map') watch('Map renderer module', () => document.querySelector('.campus-toolbar') && !document.querySelector('.map-loading'), () => document.querySelector('.campus-toolbar'));
      if (button.getAttribute('aria-label') === 'Close' && document.querySelector('.ss-root')) watch('Close search', () => !document.querySelector('.ss-root'), () => document.querySelector('.home-content'));
    }, true);
  });
})();
