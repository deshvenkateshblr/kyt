/* Page script for index.html */

/* Same service worker registration the other KYT pages use, so adding to the home screen from here works too. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js')
      .then(function (reg) { console.log('[SW] Registered:', reg.scope); })
      .catch(function (err) { console.warn('[SW] Registration failed:', err); });
  });
}

/* "Add to Home Screen" at the top jumps to the steps, which are folded: open them. */
(function () {
  var fold = document.querySelector('.k-fold');
  var link = document.querySelector('.k-install-btn');
  if (fold && link) link.addEventListener('click', function () { fold.open = true; });
})();
