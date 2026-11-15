#!/usr/bin/env node
'use strict';
/**
 * One command for a release: sets the version in the three places that must agree.
 *   sw.js            CACHE_NAME = 'kyt-v<N>'   (a new number makes phones fetch the new files)
 *   js/footer.js     APP_VERSION = <N>          (what the footer shows)
 *   every page       ?v=<N> on its own scripts and styles (so the browser's own cache fetches them again)
 * Usage:  node scripts/bump-version.js          adds one to the current version
 *         node scripts/bump-version.js 120      sets it to 120
 * The e2e tests check that all of them agree, so a forgotten place fails loudly.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

const current = Number(/CACHE_NAME = 'kyt-v(\d+)'/.exec(read('sw.js'))[1]);
const next = process.argv[2] ? Number(process.argv[2]) : current + 1;
if (!Number.isInteger(next) || next < 1) { console.error('Give a whole number, or nothing to add one.'); process.exit(1); }

write('sw.js', read('sw.js').replace(/CACHE_NAME = 'kyt-v\d+'/, `CACHE_NAME = 'kyt-v${next}'`));
write('js/footer.js', read('js/footer.js').replace(/APP_VERSION = \d+/, `APP_VERSION = ${next}`));
let pages = 0, tags = 0;
for (const f of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
  const before = read(f);
  const after = before.replace(/((?:src|href)="(?:\.\/)?[a-zA-Z0-9_\/.-]+\.(?:js|css))\?v=\d+"/g, (m, head) => { tags++; return `${head}?v=${next}"`; });
  if (after !== before) { write(f, after); pages++; }
}
console.log(`Version ${current} -> ${next}: sw.js, js/footer.js, ${tags} tags in ${pages} pages.`);
