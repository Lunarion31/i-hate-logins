# Pricing Peek

A standalone Chrome/Edge extension that shows a dismissible notice in the bottom-right corner when the page links to pricing. Click **View pricing** to visit the detected page.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `pricing-peek` folder.
4. Reload any already-open websites.

It checks links, pricing headings, named pricing sections, and pricing buttons/tabs locally, including content added dynamically. **View pricing** follows a pricing link, jumps to a section, or activates the site's pricing control. Explicit pricing links can lead to another domain. It never automatically clicks purchase or checkout buttons.

It does not crawl other pages, guess URLs, or inspect closed shadow roots or embedded frames, so pricing without recognizable text or markup may go undetected. Dismissing lasts until a full page reload or navigation. No storage, tracking, or background network requests are used.

Run the browser checks from the parent directory with `node --test pricing-peek/tests/extension.test.cjs` (uses the parent's Playwright dependency).
