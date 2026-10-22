(() => {
  if (window.__justScroll) return;
  window.__justScroll = true;
  const host = location.hostname;
  const hidden = new Map();
  const styles = new Map();
  let enabled = false;
  let count = 0;
  let intentionalLoginUntil = 0;
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
    hidden.clear(); styles.clear(); count = 0;
  }
  function isGate(el) {
    if (el === document.body || el === document.documentElement || hidden.has(el)) return false;
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
  function scan(elements) {
    if (!enabled) return;
    observer.disconnect();
    try {
      if (protectedRoute()) { restore(); return; }
      if (Date.now() < intentionalLoginUntil) return;
      let removed = false;
      // Drop references when frameworks discard a hidden component.
      for (const el of hidden.keys()) if (!el.isConnected) hidden.delete(el);
      for (const el of elements) {
        if (!el.isConnected) continue;
        if (hidden.has(el)) {
          if (el.style.getPropertyValue('display') !== 'none' || el.style.getPropertyPriority('display') !== 'important' || (el instanceof HTMLDialogElement && el.open)) hide(el);
          continue;
        }
        if (!isGate(el)) continue;
        hide(el); count++; removed = true;
        const parent = el.parentElement;
        if (parent && parent !== document.body && parent.children.length <= 4) {
          for (const sibling of parent.children) {
            if (sibling !== el && sibling.matches('[class*="backdrop" i], [class*="overlay" i]') && !sibling.textContent.trim() && !sibling.querySelector('img,video,iframe')) hide(sibling);
          }
        }
      }
      if (removed) unlock();
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
    if (enabled) observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'aria-modal', 'role', 'hidden'] });
  }
  async function configure() {
    const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
    enabled = !pausedHosts.includes(host);
    observer.disconnect();
    if (enabled) scanAll(); else restore();
  }
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
