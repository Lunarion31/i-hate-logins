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
    // An unrelated active modal keeps its backdrop and scroll lock.
    assert.equal(await page.locator('.backdrop').isVisible(), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
    await page.evaluate(() => {
      document.querySelector('#consent').remove(); document.querySelector('#purchase').remove();
      messageListeners.forEach(fn => fn({ type: 'clean' }, {}, () => {}));
    });
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

test('detached grey scrims, empty portal wrappers, inert content, and late click shields', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="overflow:hidden">
      <main inert aria-hidden="true" style="height:100vh;pointer-events:none;filter:blur(3px)"><button id="target" onclick="window.clicked=true">Read article</button></main>
      <div id="scrim" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100"></div>
      <div id="portal" style="position:fixed;inset:0;z-index:101"><section id="gate" role="dialog" style="position:absolute;inset:20%">Log in to keep viewing</section></div>
      </body></html>` }));
    await page.goto('https://example.com/feed');
    await page.evaluate(() => {
      window.listeners = [];
      window.chrome = {
        storage: { local: { get: async () => ({ pausedHosts: window.paused ? ['example.com'] : [] }) }, onChanged: { addListener: fn => listeners.push(fn) } },
        runtime: { onMessage: { addListener() {} } }
      };
    });
    await page.addScriptTag({ path: path.resolve('content.js') });
    await page.waitForFunction(() => document.querySelector('#scrim').style.display === 'none');
    assert.equal(await page.locator('#portal').isVisible(), false);
    assert.equal(await page.locator('main').getAttribute('inert'), null);
    assert.equal(await page.locator('main').getAttribute('aria-hidden'), null);
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.locator('#target').click();
    assert.equal(await page.evaluate(() => window.clicked), true);
    await page.evaluate(() => {
      const shield = document.createElement('div'); shield.id = 'shield'; shield.style.cssText = 'position:fixed;inset:0;z-index:200'; document.body.append(shield);
      document.querySelector('main').setAttribute('inert', '');
    });
    await page.waitForFunction(() => document.querySelector('#shield').style.display === 'none' && !document.querySelector('main').inert);
    await page.evaluate(() => { window.paused = true; listeners.forEach(fn => fn({ pausedHosts: {} }, 'local')); });
    await page.waitForFunction(() => document.querySelector('#scrim').style.display !== 'none');
    assert.equal(await page.locator('main').getAttribute('inert'), '');
    assert.equal(await page.locator('main').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('main').evaluate(el => el.style.pointerEvents), 'none');
    assert.equal(await page.locator('main').evaluate(el => el.style.filter), 'blur(3px)');
  } finally { await browser.close(); }
});

test('a grey overlay alone is not evidence of a login gate', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main inert>Public content</main><div id="shade" style="position:fixed;inset:0;background:#0008"></div>');
    await page.evaluate(() => {
      window.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } }, runtime: { onMessage: { addListener() {} } } };
    });
    await page.addScriptTag({ path: path.resolve('content.js') });
    assert.equal(await page.locator('#shade').isVisible(), true);
    assert.equal(await page.locator('main').getAttribute('inert'), '');
  } finally { await browser.close(); }
});

test('Pinterest gated cards preview images, support keyboard/escape, preserve controls and pause', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://i.pinimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#bb8855"/><circle cx="200" cy="200" r="100" fill="#553322"/></svg>' }));
    await page.route('https://www.pinterest.com/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body><div data-test-id="gated-pin-rep"><div id="card" role="button" tabindex="0"><div data-test-id="gated-pin-image"><img src="https://i.pinimg.com/236x/example.jpg" alt="Autumn inspiration"></div><button id="save">Save</button></div></div></body></html>` }));
    await page.goto('https://www.pinterest.com/board/');
    await page.evaluate(() => {
      window.listeners = []; window.gateClicks = 0;
      document.querySelector('#card').addEventListener('click', () => window.gateClicks++);
      window.chrome = { storage: { local: { get: async () => ({ pausedHosts: window.paused ? ['www.pinterest.com'] : [] }) }, onChanged: { addListener: fn => listeners.push(fn) } }, runtime: { onMessage: { addListener() {} } } };
    });
    await page.addScriptTag({ path: path.resolve('content.js') });
    await page.locator('img').click();
    assert.equal(await page.getByRole('dialog', { name: 'Pin image preview' }).isVisible(), true);
    assert.equal(await page.evaluate(() => window.gateClicks), 0);
    await page.screenshot({ path: '/tmp/just-scroll-pinterest-preview.png' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'card');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog'));
    await page.locator('#save').click();
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.gateClicks), 1);
    await page.locator('img').click();
    await page.evaluate(() => { window.paused = true; listeners.forEach(fn => fn({ pausedHosts: {} }, 'local')); });
    await page.waitForFunction(() => !document.querySelector('dialog'));
    await page.locator('img').click();
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.gateClicks), 2);
  } finally { await browser.close(); }
});

test('Pinterest opens explicit public pin destinations; unrelated hosts and unsafe media stay untouched', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: `<div data-test-id="gated-pin-rep"><div role="button" tabindex="0" id="card"><a href="/pin/123456789/">Open pin</a><img src="https://unrelated.example/photo.jpg" alt="Pin"></div></div>` }));
    await page.addInitScript(() => {
      window.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } }, runtime: { onMessage: { addListener() {} } } };
      document.addEventListener('click', event => { window.blocked = true; event.preventDefault(); });
    });
    await page.addInitScript({ path: path.resolve('content.js') });
    await page.goto('https://www.pinterest.com/board/');
    // Click the primary button itself, whose normal handler would gate navigation.
    await page.locator('#card').press('Enter');
    await page.waitForURL('https://www.pinterest.com/pin/123456789/');
    await page.goto('https://www.pinterest.com/board/');
    await page.getByRole('link', { name: 'Open pin' }).click();
    await page.waitForURL('https://www.pinterest.com/pin/123456789/');
    await page.goto('https://not-pinterest.example/board/');
    await page.locator('#card').press('Enter');
    assert.equal(page.url(), 'https://not-pinterest.example/board/');
    await page.goto('https://www.pinterest.com/board/');
    await page.evaluate(() => document.querySelector('a').remove());
    await page.locator('#card').press('Enter');
    assert.equal(await page.locator('dialog').count(), 0);
    assert.equal(page.url(), 'https://www.pinterest.com/board/');
  } finally { await browser.close(); }
});
