/* Page script for index.html, moved out of the HTML so HTML auto-formatters cannot corrupt it. Loaded as a classic script at the same position. */
      /* The Been There Done That seal: same geometry as the passport in visited.html. */
      function kytSeal(id, label, sub) {
        var fs = label.length > 8 ? 6.4 : (label.length > 6 ? 8 : 10);
        return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
          '<path id="' + id + '" d="M 50,50 m -35,0 a 35,35 0 1,1 70,0 a 35,35 0 1,1 -70,0" fill="none"/>' +
          '<text font-size="10.5" font-weight="800" fill="currentColor" letter-spacing="3.5">' +
            '<textPath href="#' + id + '">BEEN THERE DONE THAT • </textPath>' +
          '</text>' +
          '<circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>' +
          '<circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 2" opacity="0.85"/>' +
          '<text x="50" y="51" text-anchor="middle" font-size="' + fs + '" font-weight="800" fill="currentColor">' + label + '</text>' +
          '<text x="50" y="62" text-anchor="middle" font-size="5.2" font-weight="800" fill="currentColor" letter-spacing="1">' + sub + '</text>' +
        '</svg>';
      }
      (function () {
        var n = 0;
        [].forEach.call(document.querySelectorAll('.k-seals .k-seal'), function (el) {
          el.innerHTML = kytSeal('kseal' + (n++), el.getAttribute('data-city'), el.getAttribute('data-sub'));
        });
      })();

      /* Hero demo: plan a day, add photos to steps, finish the day, get the seal. */
      (function () {
        var steps = [
          { t: '09:30', title: 'Lotus Mahal', where: 'Zenana Enclosure, Hampi', pic: 'p-a' },
          { t: '10:45', title: 'Elephant Stables', where: 'Zenana Enclosure, Hampi', pic: 'p-b' },
          { t: '13:00', title: 'Lunch by the Tungabhadra', where: 'Hampi', pic: 'p-c' }
        ];
        var FIRST = 3, TOTAL = 8, i = 0, photos = [false, false, false];
        var $ = function (id) { return document.getElementById(id); };
        var prog = $('prog'), ticket = $('ticket'), nextRow = $('nextRow'), endBox = $('endBox');
        if (!prog || !ticket) return;
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var sealed = false;

        function renderPhoto() {
          var on = !!photos[i];
          $('photoBox').hidden = !on;
          if (on) $('photoUse').setAttribute('href', '#' + steps[i].pic);
          $('photoBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
          $('photoTxt').textContent = on ? 'Photo added' : 'Add photo';
        }
        function render(animate) {
          var done = i >= steps.length, n = FIRST + i, html = '';
          for (var k = 1; k <= TOTAL; k++) {
            var cls = (k < n ? 'd' : (k === n && !done ? 'n' : (done && k <= FIRST + steps.length - 1 ? 'd' : '')));
            html += '<i class="' + cls + '"></i>';
          }
          prog.innerHTML = html;
          $('stepNo').textContent = done ? 'Day complete' : 'Step ' + n + ' of ' + TOTAL;
          ticket.hidden = done; endBox.hidden = !done;
          var nx = steps[i + 1];
          nextRow.hidden = done || !nx;
          if (!done) {
            $('dTime').textContent = steps[i].t; $('dTitle').textContent = steps[i].title; $('dWhere').textContent = steps[i].where;
            if (nx) { $('nTime').textContent = nx.t; $('nTitle').textContent = nx.title; }
            renderPhoto();
            if (animate && !reduce) { ticket.classList.remove('k-swap'); void ticket.offsetWidth; ticket.classList.add('k-swap'); }
          } else {
            var count = photos.filter(Boolean).length, t = '';
            steps.forEach(function (s, k) {
              t += photos[k] ? '<span class="has"><svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice"><use href="#' + s.pic + '" width="120" height="80"/></svg></span>' : '<span></span>';
            });
            $('tiles').innerHTML = t;
            $('endMsg').textContent = count ? 'Your steps and ' + count + (count === 1 ? ' photo are' : ' photos are') + ' now a memory book.' : 'Add a photo to a step and it lands in your memory book.';
            $('endSeal').innerHTML = kytSeal('kseal-demo', 'HAMPI', 'DAY 2');
            endBox.classList.remove('k-stampin'); void endBox.offsetWidth; if (animate) endBox.classList.add('k-stampin');
          }
        }
        $('photoBtn').addEventListener('click', function () { photos[i] = !photos[i]; renderPhoto(); });
        $('doneBtn').addEventListener('click', function () { i++; render(true); });
        $('replayBtn').addEventListener('click', function () { i = 0; photos = [false, false, false]; render(true); });
        render(false);
      })();

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
