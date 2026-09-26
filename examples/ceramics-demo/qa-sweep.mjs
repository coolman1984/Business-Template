// UI sweep for the demo: every page × Arabic/English × light/dark × desktop/phone.
// Fails on JS errors, sideways page scroll, clipped content, leaked i18n keys, broken drawers,
// and broken search/filter/sort/paging/toggles/menu/sign-in.
// Run: node examples/ceramics-demo/qa-sweep.mjs   (PLAYWRIGHT_MODULE and CHROMIUM_PATH override the defaults)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-'));
for (const f of ['data.js', 'app.js', 'styles.css']) fs.copyFileSync(path.join(here, f), path.join(dir, f));
// Same wrapper the artifact host adds around the page.
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(path.join(here, 'index.html'), 'utf8') + '</body></html>');
const URL_ = pathToFileURL(path.join(dir, 'index.html')).href;
// Playwright is a dev tool here, not a project dependency: use the one on this machine.
async function loadPlaywright() {
  for (const spec of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    if (!spec) continue;
    try { return await import(spec); } catch { /* try the next location */ }
  }
  console.error('Playwright not found. Set PLAYWRIGHT_MODULE to its index.mjs.');
  process.exit(2);
}
const { chromium } = await loadPlaywright();
const chromiumPath = process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const problems = new Set();
const note = (m) => problems.add(m);
const b = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
try {
const PAGES = ['profile','exec','planning','prep','glaze','lines','sorting','quality','stores','sales','dispatch','purchasing','maintenance','energy','people','costing','safety','tablet','import','products','materials','recipes','assets','spareParts','warehouses','suppliers','dealers','employees','codes'];

// Layout audit: page must not scroll sideways; nothing may be clipped by an overflow:hidden box;
// no text overflows its own box; no raw i18n keys or "undefined"/"NaN" leak into the UI.
async function audit(p, ctx) {
  const r = await p.evaluate(() => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > window.innerWidth + 1) out.push('page scrolls sideways by ' + (de.scrollWidth - window.innerWidth) + 'px');
    for (const el of document.querySelectorAll('#app *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      if (clipsX && el.scrollWidth > el.clientWidth + 2 && !(cs.textOverflow === 'ellipsis') && !el.closest('.nav-item') && !el.classList.contains('brand') && !el.closest('.comp') && !el.closest('.bar-track'))
        out.push('clipped content in <' + el.tagName.toLowerCase() + ' class="' + el.className + '">: ' + el.textContent.trim().slice(0, 40));
    }
    const text = document.getElementById('app').innerText;
    const leaks = text.replace(/S\.p\.A\./g, "").match(/\b(undefined|NaN|null|\[object Object\])\b|\b[a-z]+\.[a-zA-Z]+\.[a-zA-Z.]+\b|\b(c|s|d|k|p|g|pm|lvl|rm|tab|profile|planned)\.[a-zA-Z0-9]+\b/g);
    if (leaks) out.push('raw text leaked: ' + [...new Set(leaks)].slice(0, 5).join(', '));
    return out;
  });
  r.forEach((m) => note(ctx + ' — ' + m));
}

for (const vp of [{ w: 1400, h: 900, name: 'desktop' }, { w: 390, h: 844, name: 'phone' }]) {
  for (const locale of ['ar', 'en']) {
    for (const dark of [false, true]) {
      const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, colorScheme: dark ? 'dark' : 'light' });
      p.on('pageerror', (e) => note(`${vp.name}/${locale}: JS error ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text())) note(`${vp.name}/${locale}: console ${m.text()}`); });
      await p.addInitScript((l) => localStorage.setItem('nova-locale', l), locale);
      await p.goto(URL_);
      for (const id of PAGES) {
        await p.evaluate((id) => { location.hash = id; }, id);
        await p.evaluate((id) => { const b = document.querySelector('[data-action="nav"][data-id="' + id + '"]'); if (b) b.click(); }, id);
        await p.waitForTimeout(30);
        const title = await p.$eval('h1', (h) => h.textContent).catch(() => null);
        if (!title) note(`${vp.name}/${locale}: ${id} has no heading`);
        const ctx = `${vp.name}/${locale}/${dark ? 'dark' : 'light'}/${id}`;
        await audit(p, ctx);
        if (id === 'codes') {
          for (const tab of ['downtime', 'tests']) { await p.click(`[data-tab="${tab}"]`); await audit(p, ctx + '#' + tab); }
        }
        // Open the first row's drawer and follow every link inside it once.
        const hasRow = await p.$('tr.row');
        if (hasRow && !dark) {
          await p.evaluate(() => document.querySelector('tr.row').click());
          await p.waitForTimeout(30);
          if (!(await p.$('.drawer'))) note(ctx + ': row did not open a drawer');
          else {
            await audit(p, ctx + ' drawer');
            const links = await p.$$eval('.drawer [data-action="open"]', (els) => els.map((e, i) => i));
            for (const i of links.slice(0, 6)) {
              await p.evaluate((i) => document.querySelectorAll('.drawer [data-action="open"]')[i]?.click(), i);
              await p.waitForTimeout(20);
              const h = await p.$eval('.drawer h2', (h) => h.textContent).catch(() => '');
              if (!h.trim()) note(ctx + ': nested drawer link ' + i + ' opened an empty drawer');
              await audit(p, ctx + ' nested drawer');
              if (await p.$('[data-action="drawerBack"]')) await p.click('[data-action="drawerBack"]');
            }
            await p.keyboard.press('Escape');
            if (await p.$('.drawer')) note(ctx + ': Escape did not close the drawer');
          }
        }
      }
      // List mechanics on the biggest list: search, filters, sort, paging, empty state.
      await p.evaluate(() => { location.hash = 'employees'; document.querySelector('[data-action="nav"][data-id="employees"]').click(); });
      const count = async () => p.$eval('.pager span', (s) => s.textContent);
      const before = await count();
      await p.fill('#search-employees', locale === 'ar' ? 'مشغل فرن' : 'Kiln operator');
      const afterSearch = await count();
      if (afterSearch === before) note(`${vp.name}/${locale}: search did not narrow the list`);
      await p.fill('#search-employees', 'zzzzqqq');
      if (!(await p.$('.empty'))) note(`${vp.name}/${locale}: no empty state for a search with no results`);
      await p.fill('#search-employees', '');
      await p.selectOption('select[data-filter="dept"]', 'D05');
      if ((await count()) === before) note(`${vp.name}/${locale}: department filter did not apply`);
      await p.selectOption('select[data-filter="dept"]', '');
      await p.click('th[data-key="hired"]'); const first1 = await p.$eval('tbody tr td', (td) => td.textContent);
      await p.click('th[data-key="hired"]'); const first2 = await p.$eval('tbody tr td', (td) => td.textContent);
      if (first1 === first2) note(`${vp.name}/${locale}: sort direction toggle had no effect`);
      const firstRow = async () => p.$eval('tbody tr.row td', (td) => td.textContent);
      const rowBefore = await firstRow();
      await p.click('[data-action="page"]:not([disabled])');
      if ((await firstRow()) === rowBefore) note(`${vp.name}/${locale}: Next page did not change the rows`);
      // Keyboard: Enter on a header sorts and keeps focus on that header.
      await p.focus('th[data-key="name"]');
      await p.keyboard.press('Enter');
      const focusedKey = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-key'));
      if (focusedKey !== 'name') note(`${vp.name}/${locale}: keyboard sort lost focus`);
      // Theme and language toggles keep the current page.
      await p.click('[data-action="theme"]');
      await p.click('[data-action="locale"]');
      const h1 = await p.$eval('h1', (h) => h.textContent);
      if (!/Employees|العاملين/.test(h1)) note(`${vp.name}/${locale}: toggling language left the page (${h1})`);
      // Mobile menu opens and closes.
      if (vp.name === 'phone') {
        await p.click('.menu-btn');
        await p.waitForTimeout(250);
        // The menu must really be on screen, not just carry an "open" class.
        const onScreen = await p.$eval('.sidebar', (el) => {
          const r = el.getBoundingClientRect();
          return getComputedStyle(el).visibility === 'visible' && r.right > 10 && r.left < window.innerWidth - 10;
        });
        if (!onScreen) note(`phone/${locale}: menu did not appear on screen`);
        const tabbableWhenClosed = async () => p.$eval('.sidebar', (el) => getComputedStyle(el).visibility !== 'hidden');
        await p.keyboard.press('Escape');
        await p.waitForTimeout(250);
        if (await p.$('.sidebar.open')) note('phone: Escape did not close the menu');
        if (await tabbableWhenClosed()) note(`phone/${locale}: closed menu is still reachable by keyboard`);
      }
      await p.close();
    }
  }
}
// Sign out and back in.
const p = await b.newPage();
await p.goto(URL_);
await p.click('[data-action="signOut"]');
if (!(await p.$('form[data-form="login"]'))) note('sign-out did not show the login form');
await p.click('form[data-form="login"] button[type="submit"]');
if (!(await p.$('.shell'))) note('sign-in did not return to the app');
} finally {
  await b.close().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
if (problems.size) { console.error([...problems].sort().join('\n')); process.exit(1); }
console.log('UI sweep passed: no problems found.');
