# Just Scroll

A small, local-only Chrome Manifest V3 extension that hides login nag overlays and restores page scrolling. No build step, analytics, or remote code. Pinterest previews reuse image URLs already exposed by the page; the browser may request those images from Pinterest’s image CDN.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Reload any already-open website tabs. Pin Just Scroll for easy access.

Automatic detection runs on all HTTP and HTTPS websites at document start. Chrome will request access to all websites when you install or reload this version; restricted browser pages and the Web Store remain excluded. You can limit site access through Chrome’s extension settings.

The detector combines login/continuation wording, dialog semantics, positioning, and size. It inspects changed elements and ancestors immediately through a MutationObserver, usually before the next paint. It handles arbitrary class names and text changes, not just known site selectors. There is no 150 ms debounce. This suppresses matching DOM overlays; it does not block network downloads or prevent the site’s JavaScript from executing. Initial preference loading, CSS animations, and unusual rendering can still cause a flash or a missed prompt.

The switch pauses an exact hostname and restores changes made by the extension. Preferences stay on this device. Login and account routes are skipped so you can deliberately sign in. Clicking a login/signup button temporarily suspends detection for 15 seconds; Clean this page resumes it immediately.

## What to expect

This is a heuristic first version, not a guaranteed bypass for any particular site. It identifies visible dialogs or prominent positioned overlays containing login and signup/continuation language, removes large empty backdrops and transparent click shields (including separate portals), and releases body/document scroll locks. After a confirmed login gate, it also restores interaction on large page surfaces disabled by inert, aria-hidden, pointer-events, or blur. It leaves those locks alone while another visible dialog is open. Pausing restores saved styles and attributes. It watches for dynamically inserted prompts. English prompts are supported initially.

It cannot retrieve content withheld by a server, bypass real authentication, fix login redirects, or guarantee infinite scrolling. It leaves purchase, consent, and age-verification dialogs alone. Some overlays use unusual markup, pseudo-element backdrops, shadow DOM, event handlers that intercept clicks, or custom scroll containers and may need site-specific rules. A false positive is possible: pause the site or reload to reset the page.

## Pinterest cards

On supported Pinterest domains, clicking a `gated-pin-rep` card opens its explicit public `/pin/<number>/` link when one exists. If no link is exposed, it shows a clearly labeled enlarged preview of the card’s current image (or a video poster). It never guesses pin IDs or fetches private data. Image previews do not include pin details, comments, saving, or video playback. Existing card resolution limits preview quality.

Enter/Space also activates a focused gated card. Escape, Close, or clicking outside closes the preview and restores focus. Pausing the site disables this handling. Nested Save/Share controls and ordinary cards keep their original behavior. A public pin page may still require login. This handling is verified with browser fixtures matching observed Pinterest markup, not an end-to-end test in an installed extension against live Pinterest.

## Permissions

- `storage`: local per-host pause preferences.
- `activeTab` and `scripting`: manually activate on the tab where you click the extension.
- Declared content-script site access: automatically inspect page DOM on all HTTP/HTTPS websites. Page content never leaves the browser.

## Development

Edit files directly and click Reload on the extension card in `chrome://extensions`, then reload the website. Run `npm test` for browser fixture tests after `npm install` and `npx playwright install chromium`.
