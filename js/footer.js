/**
 * footer.js — one feedback link at the foot of every page.
 * Add <script src="./js/footer.js"></script> to a page and it appears; nothing else to maintain.
 * Change the address in FEEDBACK_EMAIL below and every page follows.
 */
(function () {
  'use strict';
  const FEEDBACK_EMAIL = 'info@vividnova.com';

  function render() {
    if (document.getElementById('kyt-feedback-footer')) return;
    const page = (location.pathname.split('/').pop() || 'index.html');
    const subject = encodeURIComponent('KYT feedback');
    const body = encodeURIComponent(`\n\n\n(Sent from KYT, page: ${page})`);
    const wrap = document.createElement('div');
    wrap.id = 'kyt-feedback-footer';
    wrap.style.cssText = 'box-sizing:border-box;width:100%;padding:14px 16px calc(14px + env(safe-area-inset-bottom));text-align:center;font:600 13px/1.4 system-ui,-apple-system,sans-serif;color:#64748B;background:#F8FAFC;border-top:1px solid #E2E8F0;';
    wrap.innerHTML = `Questions, comments and feedback, write to <a href="mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}" style="display:inline-block;padding:8px 2px;color:#1D4ED8;font-weight:800;text-decoration:underline;text-underline-offset:3px">${FEEDBACK_EMAIL}</a>`;
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
