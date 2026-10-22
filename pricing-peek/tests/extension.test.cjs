const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('pricing notice detection, dynamic links and dismissal', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.com/**', route => route.fulfill({ body: '<html><body><h1>Example</h1></body></html>', contentType: 'text/html' }));
    await page.goto('https://example.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../content.js') });
    const notice = page.locator('[data-pricing-peek]');
    assert.equal(await notice.count(), 0);
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a href="javascript:alert(1)">Pricing</a><a href="#pricing">Pricing</a>'); });
    await page.waitForTimeout(400);
    assert.equal(await notice.count(), 0);
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a href="/pricing">Pricing</a>'); });
    await notice.waitFor();
    assert.equal(await notice.locator('a').getAttribute('href'), 'https://example.com/pricing');
    await notice.getByRole('button', { name: 'Dismiss pricing notice' }).click();
    await page.evaluate(() => document.body.append(document.createElement('div')));
    await page.waitForTimeout(400);
    assert.equal(await notice.count(), 0);
  } finally { await browser.close(); }
});

 test('reaches fragments, unlinked sections, JS controls, and external pricing', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { html: '<a href="#costs">Pricing</a><div style="height:2000px"></div><div id="costs">$20/month</div>', target: '#costs' },
      { html: '<div style="height:2000px"></div><h2>Simple pricing</h2><p>$20/month</p>', target: 'h2' },
      { html: '<nav><span>pricing</span></nav><div style="height:2000px"></div><section id="pr"><div><div>pricing</div><h2>heyclicky, your way</h2></div><p>$20/month</p></section>', target: '#pr' },
      { html: '<button onclick="document.body.dataset.opened=1">See pricing</button>', control: true },
      { html: '<a href="https://billing.other.com/pricing">Pricing</a>', url: 'https://billing.other.com/pricing' }
    ]) {
      const page = await browser.newPage();
      await page.route('https://example.com/**', route => route.fulfill({ body: `<html><body>${scenario.html}</body></html>`, contentType: 'text/html' }));
      await page.goto('https://example.com/');
      await page.addScriptTag({ path: path.join(__dirname, '../content.js') });
      const action = page.locator('[data-pricing-peek]').locator('a');
      await action.waitFor();
      if (scenario.url) assert.equal(await action.getAttribute('href'), scenario.url);
      else {
        await action.click();
        if (scenario.control) assert.equal(await page.locator('body').getAttribute('data-opened'), '1');
        else {
          const box = await page.locator(scenario.target).boundingBox();
          assert.ok(box.y >= 0 && box.y < 720, 'pricing section should be in view');
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
