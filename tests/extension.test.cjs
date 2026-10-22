const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('dismissal, scroll restoration, dynamic prompts, exclusions, and pause', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.com/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://example.com/feed');
    await page.evaluate(() => {
      window.storageListeners = [];
      window.messageListeners = [];
      window.chrome = {
        storage: { local: { get: async () => ({ pausedHosts: window.pausedHosts || [] }) }, onChanged: { addListener: fn => storageListeners.push(fn) } },
        runtime: { onMessage: { addListener: fn => messageListeners.push(fn) } }
      };
      document.body.style.overflow = 'hidden';
      document.body.innerHTML = `<main><h1>Public feed</h1><a href='/login'>Log in</a><a href='/signup'>Sign up</a></main>
        <div id='wrapper'><div class='backdrop' style='position:fixed;inset:0'></div><div id='gate' role='dialog' style='position:fixed;inset:20px'>Sign up or Log in to keep viewing</div></div>
        <div id='consent' role='dialog'>Cookie consent: Sign up or Log in</div>
        <div id='purchase' role='dialog'>Payment: Sign up or Log in</div>`;
    });
    await page.addScriptTag({ path: path.resolve('content.js') });
    await page.waitForFunction(() => document.querySelector('#gate').style.display === 'none');
    assert.equal(await page.locator('main').isVisible(), true);
    assert.equal(await page.locator('#consent').isVisible(), true);
    assert.equal(await page.locator('#purchase').isVisible(), true);
    assert.equal(await page.locator('.backdrop').isVisible(), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'auto');
    await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'delayed'; el.setAttribute('role', 'dialog'); el.textContent = 'Log in to continue'; document.body.append(el);
    });
    await page.waitForFunction(() => document.querySelector('#delayed').style.display === 'none');
    await page.evaluate(() => { window.pausedHosts = ['example.com']; storageListeners.forEach(fn => fn({ pausedHosts: {} }, 'local')); });
    await page.waitForFunction(() => document.querySelector('#gate').style.display !== 'none');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
    await page.evaluate(() => { history.pushState({}, '', '/login'); window.pausedHosts = []; storageListeners.forEach(fn => fn({ pausedHosts: {} }, 'local')); });
    assert.equal(await page.locator('#gate').isVisible(), true);
  } finally { await browser.close(); }
});

test('all-site early detection: arbitrary markup, pre-paint hiding, text updates, navigation and deliberate login', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.chrome = {
        storage: { local: { get: async () => ({ pausedHosts: [] }) }, onChanged: { addListener() {} } },
        runtime: { onMessage: { addListener() {} } }
      };
    });
    await page.addInitScript({ path: path.resolve('content.js') });
    await page.route('https://unknown-site.example/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>
      .random123 {position:fixed;inset:20%;background:white}
      header {position:fixed;top:0;width:100%;height:60px}
      </style></head><body><header><a href='/login'>Log in</a> <a href='/signup'>Sign up</a></header>
      <main>Public content</main><div id='early' class='random123'>Sign up or log in to keep viewing</div>
      <button id='login' style='position:fixed;bottom:0;right:0'>Log in</button></body></html>` }));
    await page.goto('https://unknown-site.example/feed');
    await page.waitForFunction(() => document.querySelector('#early').style.display === 'none');
    assert.equal(await page.locator('header').isVisible(), true);
    assert.equal(await page.locator('main').isVisible(), true);
    const beforePaint = await page.evaluate(() => new Promise(resolve => {
      const el = document.createElement('section'); el.id = 'new'; el.className = 'random123';
      el.textContent = 'Log in to continue'; document.body.append(el);
      requestAnimationFrame(() => resolve(getComputedStyle(el).display));
    }));
    assert.equal(beforePaint, 'none');
    await page.evaluate(() => {
      const el = document.createElement('aside'); el.id = 'text'; el.className = 'random123';
      el.textContent = 'Welcome'; document.body.append(el);
    });
    assert.equal(await page.locator('#text').isVisible(), true);
    await page.evaluate(() => { document.querySelector('#text').firstChild.data = 'Sign in to continue'; });
    await page.waitForFunction(() => document.querySelector('#text').style.display === 'none');
    // Frameworks trying to show a previously hidden component are suppressed again.
    await page.evaluate(() => { document.querySelector('#text').style.display = 'block'; });
    await page.waitForFunction(() => document.querySelector('#text').style.display === 'none');
    await page.evaluate(() => {
      const el = document.createElement('dialog'); el.id = 'native'; el.textContent = 'Log in to continue'; document.body.append(el); el.showModal();
    });
    await page.waitForFunction(() => !document.querySelector('#native').open);
    await page.locator('#login').click();
    await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'intentional'; el.setAttribute('role', 'dialog'); el.textContent = 'Log in or Sign up'; document.body.append(el);
    });
    assert.equal(await page.locator('#intentional').isVisible(), true);
  } finally { await browser.close(); }
});

test('manifest enables early automatic detection for every HTTP(S) origin', () => {
  const manifest = require('../manifest.json');
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
});
