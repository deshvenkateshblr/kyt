/**
 * footer.js — one feedback link at the foot of every page.
 * Add <script src="./js/footer.js"></script> to a page and it appears; nothing else to maintain.
 * Change the address in FEEDBACK_EMAIL below and every page follows.
 *
 * Also prints the app version, so you can tell which build a phone is really running.
 * APP_VERSION must equal the number in sw.js (CACHE_NAME = 'kyt-v<number>'); a test enforces it.
 * "Refresh app" clears the offline cache and service worker and reloads, the fix for a stale phone.
 */
(function () {
  'use strict';
  const FEEDBACK_EMAIL = 'info@vividnova.com';
  const APP_VERSION = 93;

  function render() {
    if (document.getElementById('kyt-feedback-footer')) return;
    const page = (location.pathname.split('/').pop() || 'index.html');
    const subject = encodeURIComponent('KYT feedback');
    const body = encodeURIComponent(`\n\n\n(Sent from KYT, page: ${page})`);
    const wrap = document.createElement('div');
    wrap.id = 'kyt-feedback-footer';
    wrap.style.cssText = 'box-sizing:border-box;width:100%;padding:6px 12px calc(6px + env(safe-area-inset-bottom));text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:600 12px/1.6 system-ui,-apple-system,sans-serif;color:#64748B;background:#F8FAFC;border-top:1px solid #E2E8F0;';
    const link = 'color:#1D4ED8;font-weight:800;text-decoration:underline;text-underline-offset:3px';
    wrap.innerHTML = `Feedback: <a href="mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}" style="${link}">${FEEDBACK_EMAIL}</a> · <span id="kyt-version">v${APP_VERSION}</span> · <a href="#" id="kyt-refresh" style="color:#64748B;text-decoration:underline;text-underline-offset:2px">Refresh app</a>`;
    const ver = wrap;
    ver.querySelector('#kyt-refresh').addEventListener('click', async e => {
      e.preventDefault();
      e.target.textContent = 'Refreshing…';
      try {
        if ('serviceWorker' in navigator) (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
        if (window.caches) (await caches.keys()).forEach(k => caches.delete(k));
      } catch (err) { /* reload anyway */ }
      setTimeout(() => location.reload(), 400);
    });
    // Say so when the offline cache belongs to a different build than this page.
    if (window.caches) caches.keys().then(keys => {
      const mine = keys.map(k => /^kyt-v(\d+)$/.exec(k)).filter(Boolean).map(m => +m[1]);
      if (mine.length && !mine.includes(APP_VERSION)) {
        const el = ver.querySelector('#kyt-version');
        el.textContent += ` (offline copy is v${Math.max(...mine)})`;
        el.style.color = '#B45309';
        wrap.style.whiteSpace = 'normal';
      }
    }).catch(() => {});
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
