/**
 * Indian scripts in PDFs (shared by the trip PDF and the Memory Album PDF).
 * The built-in PDF font (Roboto) is Latin only, so Hindi, Tamil, Bengali and so on printed as empty boxes. Text in those scripts
 * is set in the matching Noto Sans font, kept in /lib/fonts and fetched only when a document actually contains that script
 * (then kept by the service worker, so it works offline afterwards). Everything else stays in Roboto.
 * Right-to-left scripts (Urdu) are not supported.
 *
 *   KYT.pdfScripts.withScriptFonts(content)   marks each run of such text with its font, in place
 *   KYT.pdfScripts.scriptsIn(doc)             the scripts a pdfMake document needs, e.g. ['Deva', 'Tamil']
 *   KYT.pdfScripts.loadFonts(pdfMake, doc)    gives pdfMake the fonts that document needs
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KYT = root.KYT || {}; root.KYT.pdfScripts = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // key, Unicode block, language names for the message, font file (bold only exists for Devanagari; the others print bold as regular)
  const SCRIPTS = [
    { key: 'Deva', from: 0x0900, to: 0x097F, name: 'Hindi', file: 'NotoSansDevanagari', bold: true, font: 'NotoDeva' },
    { key: 'Bengali', from: 0x0980, to: 0x09FF, name: 'Bengali', file: 'NotoSansBengali' },
    { key: 'Gurmukhi', from: 0x0A00, to: 0x0A7F, name: 'Punjabi', file: 'NotoSansGurmukhi' },
    { key: 'Gujarati', from: 0x0A80, to: 0x0AFF, name: 'Gujarati', file: 'NotoSansGujarati' },
    { key: 'Oriya', from: 0x0B00, to: 0x0B7F, name: 'Odia', file: 'NotoSansOriya' },
    { key: 'Tamil', from: 0x0B80, to: 0x0BFF, name: 'Tamil', file: 'NotoSansTamil' },
    { key: 'Telugu', from: 0x0C00, to: 0x0C7F, name: 'Telugu', file: 'NotoSansTelugu' },
    { key: 'Kannada', from: 0x0C80, to: 0x0CFF, name: 'Kannada', file: 'NotoSansKannada' },
    { key: 'Malayalam', from: 0x0D00, to: 0x0D7F, name: 'Malayalam', file: 'NotoSansMalayalam' }
  ];
  SCRIPTS.forEach(s => { s.font = s.font || 'Noto' + s.key; });
  const ANY = /[ऀ-ൿ]/;
  const RUN = /[ऀ-ൿ‌‍][ऀ-ൿ‌‍  ]*/g;
  const scriptOfCode = c => SCRIPTS.find(s => c >= s.from && c <= s.to) || null;

  /** "ताज Taj" -> [{text:'ताज',font}, ' Taj']; text with none of these scripts comes back as one plain string. */
  function splitScripts(str) {
    if (!ANY.test(str)) return [str];
    const out = []; let last = 0, m;
    RUN.lastIndex = 0;
    while ((m = RUN.exec(str))) {
      if (m.index > last) out.push(str.slice(last, m.index));
      const run = m[0].replace(/\s+$/, ''), trail = m[0].slice(run.length);
      // a run can hold two scripts side by side: cut it where the script changes
      let cur = null, buf = '';
      const flush = () => { if (buf) out.push(cur ? { text: buf, font: cur.font } : buf); buf = ''; };
      for (const ch of run) {
        const s = scriptOfCode(ch.codePointAt(0));
        if (s && cur && s !== cur) flush();
        if (s) cur = s;
        buf += ch;
      }
      flush();
      if (trail) out.push(trail);
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push(str.slice(last));
    return out.reduce((acc, x) => { if (typeof x === 'string' && typeof acc[acc.length - 1] === 'string') acc[acc.length - 1] += x; else acc.push(x); return acc; }, []);
  }

  /** Marks every run in a pdfMake content tree, in place, so it is drawn with the right font. */
  function withScriptFonts(node) {
    const inline = item => (typeof item === 'string' ? splitScripts(item) : [walk(item)]);
    function walk(n) {
      if (typeof n === 'string') { const p = splitScripts(n); return p.length === 1 && typeof p[0] === 'string' ? n : { text: p }; }
      if (Array.isArray(n)) return n.map(walk);
      if (!n || typeof n !== 'object') return n;
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (k === 'text') {
          if (typeof v === 'string') { const p = splitScripts(v); if (!(p.length === 1 && typeof p[0] === 'string')) n.text = p; }
          else if (Array.isArray(v)) n.text = [].concat(...v.map(inline));
        } else if (v && typeof v === 'object' && k !== 'layout' && k !== 'image') n[k] = walk(v);
      }
      return n;
    }
    return walk(node);
  }

  /** The scripts present in a pdfMake document (or a plain string): ['Deva', 'Tamil']. Images are skipped. */
  function scriptsIn(doc) {
    const text = typeof doc === 'string' ? doc : JSON.stringify(doc.content || [], (k, v) => (k === 'image' ? undefined : v));
    return SCRIPTS.filter(s => new RegExp('[\\u' + s.from.toString(16).padStart(4, '0') + '-\\u' + s.to.toString(16).padStart(4, '0') + ']').test(text)).map(s => s.key);
  }
  const hasIndicScript = doc => scriptsIn(doc).length > 0;

  const toBase64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

  /** Gives pdfMake the fonts a document needs. Fails with a plain message when one cannot be fetched (first use, offline). */
  async function loadFonts(pdfMake, doc) {
    const need = SCRIPTS.filter(s => scriptsIn(doc).includes(s.key) && !(pdfMake.fonts && pdfMake.fonts[s.font]));
    if (!need.length) return;
    const added = {};
    try {
      for (const s of need) {
        const files = s.bold ? { normal: s.file + '-Regular.ttf', bold: s.file + '-Bold.ttf' } : { normal: s.file + '-Regular.ttf' };
        for (const f of new Set(Object.values(files))) {
          const res = await fetch('./lib/fonts/' + f);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          pdfMake.vfs = pdfMake.vfs || {};
          pdfMake.vfs[f] = toBase64(await res.arrayBuffer());
        }
        const bold = files.bold || files.normal;
        added[s.font] = { normal: files.normal, bold, italics: files.normal, bolditalics: bold };
      }
    } catch (e) {
      throw new Error('This has ' + need.map(s => s.name).join(' / ') + ' text, and the font for it is not on this device yet. Connect to the internet once and try again.');
    }
    const roboto = { Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } };   // pdfMake's built-in set, kept when we add fonts
    pdfMake.fonts = Object.assign({}, roboto, pdfMake.fonts, added);
  }

  return { SCRIPTS, splitScripts, withScriptFonts, scriptsIn, hasIndicScript, loadFonts };
});
