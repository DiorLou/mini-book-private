// Integration check against the actual PDF annotations, including continuation
// pages. A rendered group label without a clickable PDF link must fail.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PDFDocument, PDFName, PDFDict, PDFArray } = require('pdf-lib');
const { groupDestinations } = require('./pdf-toc-links.cjs');

async function check(project, filename) {
  const config = JSON.parse(fs.readFileSync(path.join(project, '_build/html/config.json')));
  const file = path.join(project, '_build/exports', filename);
  const qa = JSON.parse(fs.readFileSync(file.replace(/\.pdf$/, '.qa.json')));
  const pdf = await PDFDocument.load(fs.readFileSync(file));
  const starts = new Map();
  let offset = 0;
  for (const chapter of qa) { starts.set(chapter.slug, offset); offset += chapter.pages; }
  assert.equal(offset, pdf.getPageCount(), 'QA page counts must match the PDF');
  const groups = groupDestinations(config.projects[0].pages).filter(group => group.titles.length === 1);
  assert.ok(groups.length, 'Expected top-level TOC groups to validate');
  let checks = 0;
  for (const [index, page] of pdf.getPages().entries()) {
    const targets = new Set();
    for (const ref of page.node.Annots()?.asArray() || []) {
      const annotation = pdf.context.lookup(ref, PDFDict);
      const rect = annotation.lookup(PDFName.of('Rect'), PDFArray).asArray().map(n => n.asNumber());
      const destination = annotation.lookup(PDFName.of('Dest'));
      // Left margin only: body links or right-hand headings cannot satisfy this check.
      if (Math.max(rect[0], rect[2]) < page.getWidth() * 0.26 && destination instanceof PDFArray) {
        targets.add(destination.get(0).toString());
      }
    }
    for (const group of groups) {
      assert.ok(starts.has(group.slug), `Missing chapter: ${group.slug}`);
      const expected = pdf.getPage(starts.get(group.slug)).ref.toString();
      assert.ok(targets.has(expected), `Page ${index + 1}: sidebar group "${group.titles[0]}" cannot jump to ${group.slug}`);
      checks++;
    }
  }
  console.log(`PASS: ${checks} sidebar group destinations across ${pdf.getPageCount()} pages`);
}
check(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
