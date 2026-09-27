// MyST's section-only TOC entries are collapsible controls, not hyperlinks.
// PDF cannot expand them, so link each group to its first descendant article.
function groupDestinations(pages) {
  const ancestors = [];
  const links = [];
  for (let i = 0; i < pages.length; i++) {
    const entry = pages[i];
    while (ancestors.length && ancestors.at(-1).level >= entry.level) ancestors.pop();
    const titles = [...ancestors.map(p => p.short_title || p.title), entry.short_title || entry.title];
    if (!entry.slug) {
      for (let j = i + 1; j < pages.length && pages[j].level > entry.level; j++) {
        if (pages[j].slug) {
          links.push({ titles, slug: pages[j].slug });
          break;
        }
      }
    }
    ancestors.push(entry);
  }
  return links;
}

// Runs inside the browser via page.evaluate; keep it self-contained.
function linkPdfTocGroups({ links, base }) {
  const destinations = new Map(links.map(link => [JSON.stringify(link.titles), link.slug]));
  const linked = [];
  const rows = document.querySelectorAll('.myst-primary-sidebar-toc div.myst-toc-item');
  for (const row of rows) {
    const label = row.querySelector(':scope > div[title]');
    const toggle = row.querySelector(':scope > button[aria-controls]');
    if (!label || !toggle) continue;
    const titles = [label.title];
    let parentContent = row.closest('.collapsible-content');
    while (parentContent) {
      const parentLabel = parentContent.previousElementSibling?.querySelector(':scope > [title]');
      if (parentLabel) titles.unshift(parentLabel.title);
      parentContent = parentContent.parentElement.closest('.collapsible-content');
    }
    const slug = destinations.get(JSON.stringify(titles));
    if (!slug) continue; // An empty group has no article to link to.
    const anchor = document.createElement('a');
    anchor.className = row.className;
    anchor.href = base + slug + '/';
    anchor.style.color = 'inherit';
    anchor.style.textDecoration = 'none';
    anchor.dataset.pdfTocGroup = JSON.stringify(titles);
    // Replace only the export DOM. Preserve the visible title/chevron and the
    // current chapter's expanded children; the website keeps its usual controls.
    const chevron = document.createElement('span');
    chevron.className = toggle.className;
    chevron.dataset.state = toggle.dataset.state;
    chevron.innerHTML = toggle.innerHTML;
    anchor.append(label.cloneNode(true), chevron);
    row.replaceWith(anchor);
    linked.push({ titles, slug });
  }
  return linked;
}

module.exports = { groupDestinations, linkPdfTocGroups };
