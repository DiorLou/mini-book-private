// Render the built website with its own CSS; keep the desktop navigation in PDF.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { PDFDocument, PDFName, PDFHexString, PDFArray, PDFDict } = require('pdf-lib');
const { groupDestinations, linkPdfTocGroups } = require('./pdf-toc-links.cjs');

const [projectArg, filename, baseArg = ''] = process.argv.slice(2);
if (!projectArg || !filename || path.basename(filename) !== filename) {
  throw new Error('Usage: node scripts/export-web-pdf.cjs <project-directory> <filename.pdf> [base-url]');
}
const project = path.resolve(projectArg);
const root = path.join(project, '_build/html');
const prefix = '/' + baseArg.split('/').filter(Boolean).join('/');
const base = prefix === '/' ? '/' : prefix + '/';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

async function launchBrowser() {
  // Installed Chromium is used in CI; Windows users can also use their Edge.
  try { return await chromium.launch(); }
  catch (error) {
    if (process.platform === 'win32') return chromium.launch({ channel: 'msedge' });
    throw new Error('Install the PDF browser with: npx playwright install --with-deps chromium', { cause: error });
  }
}

function namedDestinations(document) {
  const result = new Map();
  function visit(node) {
    if (!(node instanceof PDFDict)) return;
    const names = node.lookup(PDFName.of('Names'));
    if (names instanceof PDFArray) {
      for (let i = 0; i < names.size(); i += 2) {
        result.set(names.lookup(i).decodeText(), names.lookup(i + 1));
      }
    }
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) kids.asArray().forEach(ref => visit(document.context.lookup(ref)));
  }
  const names = document.catalog.lookup(PDFName.of('Names'));
  if (names instanceof PDFDict) visit(names.lookup(PDFName.of('Dests')));
  const legacy = document.catalog.lookup(PDFName.of('Dests'));
  if (legacy instanceof PDFDict) legacy.entries().forEach(([key, value]) => result.set(key.decodeText(), document.context.lookup(value)));
  return result;
}

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
  const book = config.projects[0];
  const groupLinks = groupDestinations(book.pages || []);
  const chapters = [
    { slug: '', title: book.title },
    ...(book.pages || []).filter(p => p.slug && p.slug !== book.index),
  ];
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (base !== '/' && pathname.startsWith(base)) pathname = pathname.slice(base.length);
      let file = path.resolve(root, '.' + '/' + pathname.replace(/^\/+/, ''));
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Outside website root');
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, context;
  try {
    browser = await launchBrowser();
    const origin = `http://127.0.0.1:${server.address().port}`;
    context = await browser.newContext({ viewport: { width: 1511, height: 1046 }, colorScheme: 'light', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      // The book theme includes unused third-party widget/icon stylesheets.
      // Avoid making offline exports depend on those CDNs; KaTeX is local below.
      if (url.origin !== origin && request.resourceType() === 'stylesheet') return route.abort();
      return route.continue();
    });
    // Math CSS and fonts must work offline as well as on GitHub Actions.
    const katexRoot = path.dirname(require.resolve('katex/package.json'));
    await context.route('https://cdn.jsdelivr.net/npm/katex@*/dist/**', async route => {
      const suffix = new URL(route.request().url()).pathname.split('/dist/')[1];
      if (!suffix || suffix.includes('..')) return route.abort();
      const file = path.join(katexRoot, 'dist', suffix);
      await route.fulfill({ body: await fs.readFile(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    const page = await context.newPage();
    await page.emulateMedia({ media: 'screen' });
    const merged = await PDFDocument.create();
    merged.setTitle(book.title);
    merged.setProducer('Mini Book / Chromium website export');
    const chapterStarts = new Map();
    const pendingLinks = [];
    const qa = [];
    for (const chapter of chapters) {
      const url = origin + base + (chapter.slug ? chapter.slug + '/' : '');
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (!response.ok()) throw new Error(`Cannot render chapter: ${url} (${response.status()})`);
      await page.locator('article').waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const img of document.images) {
          img.loading = 'eager';
          if (!img.complete) await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error(`Image failed: ${img.src}`));
          });
          if (!img.naturalWidth) throw new Error(`Image failed: ${img.src}`);
        }
      });
      const linkedGroups = await page.evaluate(linkPdfTocGroups, { links: groupLinks, base });
      // Preserve the actual screen column positions, without CSS grid's print
      // fragmentation quirks. Fixed sidebars repeat on each sheet of a chapter.
      const layout = await page.evaluate(() => {
        const article = document.querySelector('article');
        article.querySelectorAll('.myst-backmatter-parts:empty, .myst-footer-links:empty').forEach(e => e.remove());
        const title = article.querySelector('.myst-fm-block');
        const rect = title.getBoundingClientRect();
        const right = [...article.children].find(e => e.className.includes('col-margin-right'));
        const rightRect = right?.getBoundingClientRect();
        if (right) right.classList.add('pdf-right-sidebar');
        document.querySelector('.myst-primary-sidebar')?.classList.add('pdf-left-sidebar');
        return { left: rect.x, width: rect.width, right: rightRect?.x, rightWidth: rightRect?.width };
      });
      await page.addStyleTag({ content: `
        html, body { background: white !important; color-scheme: light; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .myst-top-nav { position: static !important; height: 64px; break-after: avoid; }
        .pdf-left-sidebar { top: 64px !important; height: auto !important; overflow: visible !important; }
        .myst-primary-sidebar-pointer, .myst-primary-sidebar-nav { height: auto !important; max-height: none !important; overflow: visible !important; }
        .myst-primary-sidebar-footer { display: none !important; }
        main.article-grid { display: block !important; }
        article.article-grid { display: block !important; min-height: 0 !important; margin-left: ${layout.left}px !important; width: ${layout.width}px !important; }
        article > * { max-width: 100%; }
        .pdf-right-sidebar { position: fixed !important; top: 64px !important; left: ${layout.right || 0}px !important; width: ${layout.rightWidth || 0}px !important; margin: 0 !important; }
        h1, h2, h3, h4 { break-after: avoid; }
        p, li { orphans: 3; widows: 3; }
        pre { white-space: pre-wrap !important; overflow-wrap: anywhere; }
        pre code { white-space: pre-wrap !important; }
        .myst-code, figure, tr { break-inside: avoid; }
        .myst-code-body, .overflow-x-auto { overflow: visible !important; }
        img { max-width: 100%; max-height: 900px; object-fit: contain; }
        article > figure:last-child { margin-bottom: 0 !important; }
        thead { display: table-header-group; }
      ` });
      // Unlike a webpage, a PDF sidebar cannot scroll. Fit long outlines into
      // the printable height rather than silently cutting off their last links.
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('.myst-primary-sidebar-nav, .pdf-right-sidebar > nav')) {
          const height = Math.max(element.scrollHeight, element.getBoundingClientRect().height);
          const available = 1046 - element.getBoundingClientRect().top - 12;
          if (height > available) {
            element.style.transformOrigin = 'top left';
            element.style.transform = `scale(${available / height})`;
          }
        }
      });
      const metrics = await page.evaluate(() => ({
        title: document.title,
        sidebar: !!document.querySelector('.pdf-left-sidebar'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        textLength: document.querySelector('article').innerText.length,
      }));
      if (metrics.horizontalOverflow) throw new Error(`Horizontal clipping detected in ${chapter.slug || 'index'}`);
      const bytes = await page.pdf({ format: 'A3', landscape: true, printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: false, tagged: true });
      const source = await PDFDocument.load(bytes);
      const start = merged.getPageCount();
      chapterStarts.set(new URL(url).pathname.replace(/\/$/, ''), start);
      const copied = await merged.copyPages(source, source.getPageIndices());
      copied.forEach(p => merged.addPage(p));
      const sourcePages = source.getPages();
      const destinations = namedDestinations(source);
      // Chrome emits local web links. Convert them to PDF chapter destinations
      // below, after all chapter starting pages are known.
      for (const [pageIndex, p] of copied.entries()) {
        const annotations = p.node.Annots();
        if (!annotations) continue;
        for (const [annotationIndex, ref] of annotations.asArray().entries()) {
          const annotation = merged.context.lookup(ref, PDFDict);
          const action = annotation.lookup(PDFName.of('A'));
          if (action instanceof PDFDict) {
            const uri = action.lookup(PDFName.of('URI'));
            if (uri && typeof uri.decodeText === 'function') pendingLinks.push({ annotation, uri: uri.decodeText() });
          }
          // Retarget direct intra-chapter destinations to the copied pages.
          const original = sourcePages[pageIndex].node.Annots().lookup(annotationIndex, PDFDict);
          let dest = original.lookup(PDFName.of('Dest'));
          if (dest && typeof dest.decodeText === 'function') dest = destinations.get(dest.decodeText());
          if (dest instanceof PDFDict) dest = dest.lookup(PDFName.of('D'));
          if (dest instanceof PDFArray) {
            const target = sourcePages.findIndex(p => p.ref.toString() === dest.get(0)?.toString());
            if (target >= 0) annotation.set(PDFName.of('Dest'), merged.context.obj([copied[target].ref, ...dest.asArray().slice(1)]));
          }
        }
      }
      qa.push({ slug: chapter.slug || 'index', pages: copied.length, linkedGroups, ...metrics });
      console.log(`  ${chapter.title}: ${copied.length} PDF pages`);
    }
    for (const { annotation, uri } of pendingLinks) {
      const url = new URL(uri, origin);
      if (url.origin !== origin) continue;
      const target = chapterStarts.get(url.pathname.replace(/\/$/, ''));
      annotation.delete(PDFName.of('A'));
      if (target !== undefined) annotation.set(PDFName.of('Dest'), merged.context.obj([merged.getPage(target).ref, PDFName.of('Fit')]));
    }
    // Native PDF bookmarks provide chapter navigation in readers, too.
    const outline = merged.context.obj({ Type: 'Outlines' });
    const outlineRef = merged.context.register(outline);
    const items = chapters.map(chapter => {
      const pathname = (base + (chapter.slug ? chapter.slug + '/' : '')).replace(/\/$/, '');
      return merged.context.obj({ Title: PDFHexString.fromText(chapter.title), Parent: outlineRef,
        Dest: [merged.getPage(chapterStarts.get(pathname)).ref, PDFName.of('Fit')] });
    });
    const refs = items.map(item => merged.context.register(item));
    items.forEach((item, i) => {
      if (i) item.set(PDFName.of('Prev'), refs[i - 1]);
      if (i + 1 < refs.length) item.set(PDFName.of('Next'), refs[i + 1]);
    });
    outline.set(PDFName.of('First'), refs[0]);
    outline.set(PDFName.of('Last'), refs.at(-1));
    outline.set(PDFName.of('Count'), merged.context.obj(refs.length));
    merged.catalog.set(PDFName.of('Outlines'), outlineRef);
    const destination = path.join(project, '_build/exports', filename);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, await merged.save());
    await fs.writeFile(destination.replace(/\.pdf$/i, '.qa.json'), JSON.stringify(qa, null, 2));
    console.log(`Website PDF: ${destination} (${merged.getPageCount()} pages)`);
  } finally {
    // Cancel browser keep-alive connections before waiting for server shutdown.
    server.closeAllConnections();
    if (context) await context.close();
    if (process.env.PDF_DEBUG) console.log('Closing PDF browser...');
    if (browser) await browser.close();
    if (process.env.PDF_DEBUG) console.log('Closing PDF HTTP server...');
    await new Promise(resolve => server.close(resolve));
    if (process.env.PDF_DEBUG) console.log('PDF export cleanup complete.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
