(() => {
  if (window.__justScroll) return;
  window.__justScroll = true;
  const host = location.hostname;
  const hidden = new Map();
  const styles = new Map();
  const attributes = new Map();
  const gates = new Set();
  let enabled = false;
  let count = 0;
  let intentionalLoginUntil = 0;
  let pinPreview = null;
  const auth = /\b(log\s*in|sign\s*(?:in|up)|join\s+(?:pinterest|tumblr|x|twitter|steam)|create (?:an? |your )?account)\b/i;
  const protectedRoute = () => /\/(log[-_]?in|sign[-_]?in|sign[-_]?up|register|checkout|account|oauth|i\/flow)(?:\/|$)/i.test(location.pathname);

  function hide(el) {
    if (!hidden.has(el)) {
      hidden.set(el, {
        value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display'),
        modal: el instanceof HTMLDialogElement && el.matches(':modal')
      });
    }
    if (el instanceof HTMLDialogElement && el.open) el.close();
    el.style.setProperty('display', 'none', 'important');
  }
  function setStyle(el, property, value) {
    if (!styles.has(el)) styles.set(el, new Map());
    const saved = styles.get(el);
    if (!saved.has(property)) saved.set(property, [el.style.getPropertyValue(property), el.style.getPropertyPriority(property)]);
    el.style.setProperty(property, value, 'important');
  }
  function restore() {
    if (pinPreview) pinPreview.close();
    for (const [el, old] of hidden) {
      if (el.style.getPropertyValue('display') === 'none') {
        if (old.value) el.style.setProperty('display', old.value, old.priority);
        else el.style.removeProperty('display');
      }
      if (old.modal && el.isConnected && !el.open) el.showModal();
    }
    for (const [el, props] of styles) for (const [prop, [value, priority]] of props) {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    }
    for (const [el, props] of attributes) for (const [name, value] of props) {
      if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
    }
    hidden.clear(); styles.clear(); attributes.clear(); gates.clear(); count = 0;
  }
  function isGate(el) {
    if (el === pinPreview || el === document.body || el === document.documentElement || hidden.has(el)) return false;
    // Geometry is only consulted after the cheap positioning check. Class names aren't required.
    const css = getComputedStyle(el);
    const dialog = el.matches('[role="dialog"], [aria-modal="true"], dialog[open]');
    if (!dialog && !['fixed', 'sticky'].includes(css.position)) return false;
    if (css.display === 'none' || css.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const text = (el.innerText || '').trim();
    if (text.length > 3000 || !auth.test(text)) return false;
    if (/\b(checkout|payment|credit card|age verification|date of birth|cookie|consent)\b/i.test(text)) return false;
    const continuation = /\b(continue|keep (?:viewing|reading|scrolling|browsing)|(?:see|view|read) more|unlock|to (?:view|read|browse|see))\b/i.test(text);
    const bothActions = /\b(log\s*in|sign\s*in)\b/i.test(text) && /\b(sign\s*up|create (?:an? |your )?account|join)\b/i.test(text);
    // Ordinary sticky navigation often contains both links. It isn't a login gate.
    if (!dialog && (el.matches('header, nav, [role="navigation"], [role="banner"]') || el.querySelector('nav, [role="navigation"]'))) return false;
    const prominent = rect.width >= innerWidth * 0.45 && (rect.height >= innerHeight * 0.25 || rect.top >= innerHeight * 0.55);
    return continuation || (bothActions && (dialog || prominent));
  }
  function unlock() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const css = getComputedStyle(el);
      if (['hidden', 'clip'].includes(css.overflowY)) setStyle(el, 'overflow-y', 'auto');
      if (css.position === 'fixed') {
        const offset = parseFloat(css.top);
        setStyle(el, 'position', 'static');
        if (Number.isFinite(offset) && offset < 0) window.scrollTo(0, -offset);
      }
    }
  }
  function visible(el) {
    const css = getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function largeSurface(el) {
    const r = el.getBoundingClientRect();
    const width = Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left));
    const height = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top));
    return width * height >= innerWidth * innerHeight * 0.5;
  }
  function removeAttribute(el, name) {
    if (!el.hasAttribute(name)) return;
    if (!attributes.has(el)) attributes.set(el, new Map());
    if (!attributes.get(el).has(name)) attributes.get(el).set(name, el.getAttribute(name));
    el.removeAttribute(name);
  }
  function clearInteractionLocks(elements) {
    if (![...gates].some(el => el.isConnected)) return;
    // A second, unrelated modal may legitimately own the backdrop and the locks.
    if ([...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].some(visible)) return;
    const candidates = [...elements];
    for (const el of candidates) {
      if (!el.isConnected || el === document.body || el === document.documentElement || !visible(el)) continue;
      const css = getComputedStyle(el);
      if (!['fixed', 'absolute'].includes(css.position) || !largeSurface(el)) continue;
      // Covers both grey scrims and transparent click shields, regardless of their class.
      // Hidden login descendants don't count as visible content in a portal wrapper.
      if ((el.innerText || '').trim()) continue;
      if ([...el.querySelectorAll('button,a,input,select,textarea,img,video,iframe,canvas,svg,[contenteditable="true"]')].some(visible)) continue;
      if (css.pointerEvents !== 'none' || css.backgroundColor !== 'rgba(0, 0, 0, 0)' || css.backdropFilter !== 'none') hide(el);
    }
    for (const el of candidates) {
      if (!el.isConnected || hidden.has(el) || !visible(el) || !largeSurface(el)) continue;
      // Restore the page surface, not individual intentionally disabled controls.
      if (!el.matches('html,body,main,[role="main"]') && !el.querySelector('main,[role="main"],article,a,button')) continue;
      removeAttribute(el, 'inert');
      if (el.getAttribute('aria-hidden') === 'true') removeAttribute(el, 'aria-hidden');
      const css = getComputedStyle(el);
      if (css.pointerEvents === 'none') setStyle(el, 'pointer-events', 'auto');
      if (/blur\(/.test(css.filter)) setStyle(el, 'filter', 'none');
    }
    unlock();
  }
  function scan(elements) {
    if (!enabled) return;
    observer.disconnect();
    try {
      if (protectedRoute()) { restore(); return; }
      if (Date.now() < intentionalLoginUntil) return;
      let removed = false;
      // Drop references when frameworks discard a hidden component.
      for (const el of hidden.keys()) if (!el.isConnected) hidden.delete(el);
      for (const el of gates) if (!el.isConnected) gates.delete(el);
      const changed = [...elements];
      for (const el of changed) {
        if (!el.isConnected) continue;
        if (hidden.has(el)) {
          if (el.style.getPropertyValue('display') !== 'none' || el.style.getPropertyPriority('display') !== 'important' || (el instanceof HTMLDialogElement && el.open)) hide(el);
          continue;
        }
        if (!isGate(el)) continue;
        gates.add(el); hide(el); count++; removed = true;
      }
      clearInteractionLocks(removed ? document.querySelectorAll('*') : changed);
    } finally { observe(); }
  }
  function scanAll() { scan(document.querySelectorAll('*')); }
  // Mutation observers run at the microtask checkpoint, usually before the next paint.
  // Inspect changed subtrees and their ancestors, rather than rescanning the page on every mutation.
  const observer = new MutationObserver(records => {
    const elements = new Set();
    const roots = new Set();
    for (const record of records) {
      let el = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      for (let depth = 0; el && depth < 10; depth++, el = el.parentElement) elements.add(el);
      if (record.type === 'attributes') roots.add(record.target);
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
    }
    for (const root of roots) {
      // html/body class changes can affect existing descendants and need a complete pass.
      let ancestor = root.parentElement;
      while (ancestor && !roots.has(ancestor)) ancestor = ancestor.parentElement;
      if (ancestor) continue;
      elements.add(root);
      for (const el of root.querySelectorAll('*')) elements.add(el);
    }
    scan(elements);
  });
  function observe() {
    if (enabled) observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'aria-modal', 'role', 'hidden', 'inert', 'aria-hidden'] });
  }
  async function configure() {
    const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
    enabled = !pausedHosts.includes(host);
    observer.disconnect();
    if (enabled) scanAll(); else restore();
  }
  // Pinterest's signed-out feed renders gated buttons instead of ordinary pin links.
  // Work only with destinations/media exposed by the clicked card, never guessed pin IDs.
  function pinterestHost(hostname) {
    return /(^|\.)pinterest\.(com|co\.uk|ca|de|fr|es|it|com\.au|co\.kr|jp|pt|ch|at|cl|com\.mx)$/.test(hostname);
  }
  function pinDestination(card) {
    for (const link of card.querySelectorAll('a[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        if (url.protocol === 'https:' && !url.username && !url.password && pinterestHost(url.hostname) && /^\/pin\/\d+\/?$/.test(url.pathname)) return url.href;
      } catch { /* Ignore malformed destinations. */ }
    }
    return null;
  }
  function pinImage(card) {
    const image = card.querySelector('[data-test-id="gated-pin-image"] img, img');
    const video = card.querySelector('video');
    const source = image?.currentSrc || image?.src || video?.poster;
    if (!source) return null;
    try {
      const url = new URL(source, location.href);
      if (url.protocol !== 'https:' || !/(^|\.)pinimg\.com$/.test(url.hostname) || url.username || url.password) return null;
      return { source: url.href, alt: image?.alt || 'Pin image', poster: !image };
    } catch { return null; }
  }
  function previewPin(media, trigger) {
    if (pinPreview) pinPreview.close();
    const dialog = document.createElement('dialog');
    pinPreview = dialog;
    dialog.setAttribute('aria-label', 'Pin image preview');
    dialog.style.cssText = 'padding:0;border:0;border-radius:16px;width:min(900px,94vw);max-width:94vw;max-height:92vh;background:#172019;color:#f6f4ec;';
    const container = document.createElement('div');
    dialog.append(container);
    const root = container.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = '*{box-sizing:border-box}section{padding:16px;font:14px system-ui,sans-serif}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:17px;margin:0}button{border:1px solid #80917e;border-radius:8px;background:#253c2e;color:white;padding:8px 14px;font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #d4fa83;outline-offset:3px}img{display:block;width:100%;height:70vh;max-width:100%;object-fit:contain;margin:16px auto}p{color:#cad2c6;font-size:12px;line-height:1.5;margin:12px 0 0}';
    const panel = document.createElement('section');
    const header = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = media.poster ? 'Video poster preview' : 'Pin image preview';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    close.addEventListener('click', () => dialog.close());
    const image = document.createElement('img'); image.alt = media.alt; image.src = media.source;
    const note = document.createElement('p');
    note.textContent = 'Preview of the image available on this page. Pinterest did not provide a public pin link for this card.';
    image.addEventListener('error', () => { note.textContent = 'This image could not be loaded. Close the preview to return to the page.'; });
    header.append(title, close); panel.append(header, image, note); root.append(style, panel);
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (pinPreview === dialog) pinPreview = null;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, { once: true });
    document.body.append(dialog); dialog.showModal(); close.focus();
  }
  function handlePinterestPin(event) {
    if (!enabled || !event.isTrusted || !pinterestHost(host) || protectedRoute() || Date.now() < intentionalLoginUntil) return;
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'keydown' && (!['Enter', ' '].includes(event.key) || event.repeat)) return;
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest('[data-test-id="gated-pin-rep"]');
    if (!card) return;
    const control = target.closest('a,button,[role="button"],input,textarea,select,[contenteditable="true"]');
    // Nested save/share controls must keep their normal meaning.
    const primary = card.querySelector('[role="button"],button,a');
    const destination = pinDestination(card);
    if (control && control !== primary && !(control instanceof HTMLAnchorElement && destination && control.href === destination)) return;
    const media = destination ? null : pinImage(card);
    if (!destination && !media) return;
    // Preserve modified image-only clicks rather than unexpectedly opening a modal.
    if (!destination && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (event.altKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (destination) {
      if (event.metaKey || event.ctrlKey || event.shiftKey) window.open(destination, '_blank', 'noopener,noreferrer');
      else location.assign(destination);
    } else previewPin(media, primary || card);
  }
  window.addEventListener('click', handlePinterestPin, true);
  window.addEventListener('keydown', handlePinterestPin, true);
  // Keep deliberately opened login forms usable, even on sites with modal-only login.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element && event.target.closest('a, button, [role="button"]');
    if (event.isTrusted && target && auth.test((target.innerText || '').trim()) && (target.innerText || '').length < 100) {
      intentionalLoginUntil = Date.now() + 15000;
    }
  }, true);
  document.addEventListener('DOMContentLoaded', scanAll, { once: true });
  window.addEventListener('load', scanAll, { once: true });
  // Late stylesheets may turn ordinary markup into positioned overlays.
  document.addEventListener('load', event => { if (event.target instanceof HTMLLinkElement) scanAll(); }, true);
  window.addEventListener('popstate', scanAll);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pausedHosts) configure();
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'status') reply({ enabled, count });
    if (message.type === 'clean') { intentionalLoginUntil = 0; scanAll(); reply({ enabled, count }); }
  });
  configure();
})();
