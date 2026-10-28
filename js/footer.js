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
  const APP_VERSION = 82;

  function render() {
    if (document.getElementById('kyt-feedback-footer')) return;
    const page = (location.pathname.split('/').pop() || 'index.html');
    const subject = encodeURIComponent('KYT feedback');
    const body = encodeURIComponent(`\n\n\n(Sent from KYT, page: ${page})`);
    const wrap = document.createElement('div');
    wrap.id = 'kyt-feedback-footer';
    wrap.style.cssText = 'box-sizing:border-box;width:100%;padding:14px 16px calc(14px + env(safe-area-inset-bottom));text-align:center;font:600 13px/1.4 system-ui,-apple-system,sans-serif;color:#64748B;background:#F8FAFC;border-top:1px solid #E2E8F0;';
    wrap.innerHTML = `Questions, comments and feedback, write to <a href="mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}" style="display:inline-block;padding:8px 2px;color:#1D4ED8;font-weight:800;text-decoration:underline;text-underline-offset:3px">${FEEDBACK_EMAIL}</a>`;
    const ver = document.createElement('div');
    ver.style.cssText = 'margin-top:6px;font-size:11.5px;font-weight:700;color:#94A3B8;';
    ver.innerHTML = `<span id="kyt-version">KYT version ${APP_VERSION}</span> · <a href="#" id="kyt-refresh" style="color:#64748B;text-decoration:underline;text-underline-offset:2px;display:inline-block;padding:6px 2px">Refresh app</a>`;
    wrap.appendChild(ver);
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
        el.textContent += ` (offline copy is v${Math.max(...mine)}: tap Refresh app)`;
        el.style.color = '#B45309';
      }
    }).catch(() => {});
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
