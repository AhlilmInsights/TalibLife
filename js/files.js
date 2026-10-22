/* Files kept on this device: the Shaykh's PDFs and the readings (imported once, stored in IndexedDB),
   plus PDF rendering with pdf.js. Nothing here is uploaded anywhere. */
(function () {
  'use strict';
  const HF = window.HF;

  // ---------------------------------------------------------------- IndexedDB
  const DB = 'habitflow-files', STORE = 'files';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) { rej(new Error('No IndexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(STORE, mode); const st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    }));
  }
  HF.files = {
    index: {},       // name → { name, size, type, added } (no blobs)
    ready: null,
    async list() {
      try {
        const all = await tx('readonly', (st) => st.getAll());
        HF.files.index = Object.fromEntries((all || []).map((f) => [f.name, { name: f.name, size: f.size, type: f.type, added: f.added }]));
      } catch (e) { HF.files.index = {}; }
      return HF.files.index;
    },
    has: (name) => !!HF.files.index[name],
    async get(name) {
      try { const r = await tx('readonly', (st) => st.get(name)); return r ? r.blob : null; } catch (e) { return null; }
    },
    async put(name, blob) {
      await tx('readwrite', (st) => st.put({ name, blob, size: blob.size, type: blob.type, added: Date.now() }));
      forget(name); // a re-import replaces the old copy everywhere
      HF.files.index[name] = { name, size: blob.size, type: blob.type, added: Date.now() };
      if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
    },
    async remove(name) {
      await tx('readwrite', (st) => st.delete(name));
      delete HF.files.index[name];
      forget(name);
    },
    async usage() {
      try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; }
    }
  };
  HF.files.ready = HF.files.list();

  const blobUrls = {};
  function forget(name) {
    if (blobUrls[name]) { URL.revokeObjectURL(blobUrls[name]); delete blobUrls[name]; }
    if (pdfDocs[name]) { pdfDocs[name].then((d) => d.destroy()).catch(() => {}); delete pdfDocs[name]; }
  }
  HF.fileUrl = async (name) => {
    if (blobUrls[name]) return blobUrls[name];
    const b = await HF.files.get(name);
    if (!b) return null;
    blobUrls[name] = URL.createObjectURL(b);
    return blobUrls[name];
  };

  // ---------------------------------------------------------------- recognising imported files
  // Each book lists the official file name; we also accept renamed copies by size or by a name fragment.
  const PDF_HINTS = [
    ['0200Mutoon.pdf', ['0200mutoon', 'المستوى الثاني', 'level2', 'mutoon']],
    ['030302KitaabAtTawheedHawaahsee.pdf', ['tawheed', 'tawhid', 'التوحيد']],
    ['040402AlWaasitiyyahHawaashee.pdf', ['waasitiyyah', 'wasitiyyah', 'wasitiya', 'الواسطية']],
    ['060101Buloogh.pdf', ['buloogh', 'bulugh', 'بلوغ']],
    ['080201AlUmdatuFilAhkaam.pdf', ['umdatu', 'umdah', 'umdat', 'العمدة', 'عمدة']],
    ['usoolu-sunnah-tahiri.pdf', ['usoolu-sunnah', 'usul-sunnah', 'usool', 'أصول السنة']]
  ];
  HF.knownFiles = () => {
    const idx = HF.books.index || [];
    const pdfs = {}, audio = {};
    for (const b of idx) {
      if (b.pdfName) pdfs[b.pdfName] = { bytes: b.pdfBytes, pages: b.pdfPages, books: [...((pdfs[b.pdfName] || {}).books || []), b.id] };
      if (b.audioName) audio[b.audioName] = { bytes: b.audioBytes, book: b.id };
    }
    return { pdfs, audio };
  };
  function matchPdf(file, known) {
    const n = file.name.toLowerCase();
    for (const [name, info] of Object.entries(known.pdfs)) if (info.bytes && file.size === info.bytes) return name;
    for (const [name, hints] of PDF_HINTS) if (known.pdfs[name] && hints.some((h) => n.includes(h.toLowerCase()))) return name;
    return null;
  }
  function matchAudio(file, known) {
    const n = file.name.toLowerCase();
    for (const [name, info] of Object.entries(known.audio)) if (info.bytes && file.size === info.bytes) return name;
    for (const name of Object.keys(known.audio)) {
      const stem = name.split('_')[0].toLowerCase(); // e.g. 0601buloogh
      if (n.includes(stem)) return name;
    }
    return null;
  }
  // Import any mix of PDFs and MP3s. Returns a list of { file, as, ok, why }.
  HF.importFiles = async (fileList, opts = {}) => {
    await HF.loadBookIndex();
    const known = HF.knownFiles();
    const out = [];
    for (const f of fileList) {
      const isPdf = /pdf$/i.test(f.name) || f.type === 'application/pdf';
      const isAudio = /\.(mp3|m4a|ogg|opus|wav|aac)$/i.test(f.name) || /^audio\//.test(f.type);
      let as = null;
      if (isPdf) {
        as = opts.forcePdf || matchPdf(f, known);
        if (as && known.pdfs[as].pages) {
          // double-check the page count so a wrong PDF can't be stored under a book's name
          let n = 0;
          try { const d = await openPdfBlob(f); n = d.numPages; await d.destroy(); } catch (e) { out.push({ file: f.name, ok: false, why: "couldn't be opened as a PDF" }); continue; }
          if (n !== known.pdfs[as].pages) { out.push({ file: f.name, ok: false, why: `has ${n} pages, expected ${known.pdfs[as].pages}` }); continue; }
        }
      } else if (isAudio) {
        as = opts.forceAudio || matchAudio(f, known);
      }
      if (!as) { out.push({ file: f.name, ok: false, why: 'not recognised as one of the books or readings' }); continue; }
      try { await HF.files.put(as, f); out.push({ file: f.name, as, ok: true }); }
      catch (e) { out.push({ file: f.name, ok: false, why: 'not enough storage on this device' }); }
    }
    return out;
  };

  // ---------------------------------------------------------------- pdf.js
  let pdfjs = null;
  HF.pdfjs = async () => {
    if (pdfjs) return pdfjs;
    pdfjs = await import('../vendor/pdfjs/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
    return pdfjs;
  };
  let sharedWorker = null; // one pdf.js worker for every document
  async function openPdfBlob(blob) {
    const lib = await HF.pdfjs();
    if (!sharedWorker) sharedWorker = new lib.PDFWorker({ name: 'habitflow-pdf' });
    const data = new Uint8Array(await blob.arrayBuffer());
    return lib.getDocument({ data, worker: sharedWorker, isEvalSupported: false, disableFontFace: false }).promise;
  }
  const pdfDocs = {};
  HF.pdfDoc = (name) => {
    if (!pdfDocs[name]) {
      pdfDocs[name] = HF.files.get(name).then((b) => { if (!b) throw new Error('missing'); return openPdfBlob(b); });
      pdfDocs[name].catch(() => { delete pdfDocs[name]; });
    }
    return pdfDocs[name];
  };
  // Render part of a page (clip in PDF points) into a canvas of the given CSS width. Cached per size.
  const renderCache = new Map(); // key → canvas
  HF.renderPdfClip = async (name, pageNo, clip, cssWidth) => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const key = `${name}|${pageNo}|${clip.join(',')}|${Math.round(cssWidth)}|${dpr}`;
    if (renderCache.has(key)) { const c = renderCache.get(key); renderCache.delete(key); renderCache.set(key, c); return c; }
    const doc = await HF.pdfDoc(name);
    const page = await doc.getPage(pageNo);
    const [x0, y0, x1, y1] = clip;
    const scale = cssWidth / (x1 - x0);
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((x1 - x0) * scale * dpr);
    canvas.height = Math.round((y1 - y0) * scale * dpr);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // shift so the clip's top-left lands at the canvas origin
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -x0 * scale * dpr, -y0 * scale * dpr] }).promise;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = ((y1 - y0) * scale) + 'px';
    canvas.dataset.scale = scale;
    renderCache.set(key, canvas);
    // keep at most ~48 MB of rendered pages (a phone-size page at full density is about 5 MB)
    const bytes = () => [...renderCache.values()].reduce((a, c) => a + c.width * c.height * 4, 0);
    while (renderCache.size > 1 && (renderCache.size > 8 || bytes() > 48e6)) { const k = renderCache.keys().next().value; const c = renderCache.get(k); if (!c.isConnected) c.width = c.height = 0; renderCache.delete(k); }
    return canvas;
  };
  HF.clearRenderCache = () => { renderCache.forEach((c) => { if (!c.isConnected) { c.width = c.height = 0; } }); renderCache.clear(); };
})();
