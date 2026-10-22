(() => {
  if (window.__pricingPeek) return;
  window.__pricingPeek = true;
  let notice;
  let dismissed = false;
  let timer;
  let currentDestination;
  const pricingPath = /\/(?:pricing|plans|plans-and-pricing)(?:\/|$)/i;

  const pricingLabel = /^(?:(?:view|see|our|explore|compare|show|check|see our)\s+)?(?:pricing|plans|prices|plans\s*(?:&|and)\s*pricing|pricing\s*(?:&|and)\s*plans)(?:\s*[→↗›])?$/i;
  const labelOf = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
  function fragmentTarget(hash) {
    try {
      const id = decodeURIComponent(hash.slice(1));
      return id ? document.getElementById(id) || [...document.getElementsByName(id)].find(el => el instanceof HTMLElement) : null;
    } catch { return null; }
  }
  function findPricing() {
    let best = null;
    let bestScore = 0;
    const offer = (destination, score) => {
      if (score > bestScore) { bestScore = score; best = destination; }
    };
    for (const anchor of document.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(anchor.getAttribute('href'), location.href); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      const explicit = pricingLabel.test(labelOf(anchor));
      const samePage = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
      if (samePage) {
        const target = fragmentTarget(url.hash);
        if (target && (explicit || /pricing|prices|plans/i.test(url.hash))) offer({ element: target, control: anchor }, 8);
        continue;
      }
      const host = location.hostname.replace(/^www\./, '');
      const related = [host, `www.${host}`, `pricing.${host}`].includes(url.hostname);
      // Explicit pricing links may point to a separate billing or marketing domain.
      const score = (explicit ? 4 : 0) + (related && pricingPath.test(url.pathname) ? 2 : 0) + (url.hostname === `pricing.${host}` ? 2 : 0);
      if (score) offer({ url: url.href }, score);
    }
    for (const control of document.querySelectorAll('button,[role="button"],[role="tab"],summary,a:not([href])')) {
      if (!visible(control) || control.matches(':disabled,[aria-disabled="true"]') || !pricingLabel.test(labelOf(control))) continue;
      offer({ control }, 7);
    }
    for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"],section[id],div[id]')) {
      if (!visible(el)) continue;
      const heading = el.matches('h1,h2,h3,h4,[role="heading"]');
      const namedSection = /^(?:pricing|prices|plans|pricing-section|pricing-table|pricing-plans)$/i.test(el.id);
      if ((heading && /\b(?:pricing|our prices|choose (?:your |a )?plan|compare plans|plans and pricing)\b/i.test(labelOf(el)) && labelOf(el).length < 120) || namedSection) {
        offer({ element: el }, 9);
      }
    }
    // Some sites use ordinary text elements for section labels instead of headings.
    // Require nearby price evidence so a stray mention of pricing is not enough.
    for (const label of document.querySelectorAll('span,div,p')) {
      if (label.children.length || !pricingLabel.test(labelOf(label)) || !visible(label)) continue;
      const section = label.closest('section,article,[role="region"]');
      if (!section || label.closest('nav,header,footer')) continue;
      const text = section.textContent || '';
      if (/(?:[$€£]\s*\d|\d\s*(?:USD|EUR|GBP)|\bfree\b.*\b(?:month|year|plan))/is.test(text)) {
        offer({ element: label }, 9);
      }
    }
    return best;
  }

  function updateNotice(destination) {
    currentDestination = destination;
    const link = notice.shadowRoot.querySelector('a');
    if (destination.url) { link.href = destination.url; link.removeAttribute('role'); }
    else { link.removeAttribute('href'); link.setAttribute('role', 'button'); }
    link.tabIndex = 0;
    notice.shadowRoot.querySelector('strong').textContent = destination.url ? 'This site links to pricing.' : 'Pricing is available on this page.';
  }
  function reachPricing(event) {
    const destination = currentDestination;
    if (destination.url) return;
    event.preventDefault();
    if (destination.control?.isConnected) destination.control.click();
    if (destination.element?.isConnected) {
      for (let parent = destination.element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      destination.element.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }

  function scan() {
    if (dismissed) return;
    const destination = findPricing();
    if (!destination) { notice?.remove(); notice = null; return; }
    if (notice?.isConnected) { updateNotice(destination); return; }
    notice = document.createElement('div');
    notice.dataset.pricingPeek = '';
    notice.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;width:min(340px,calc(100vw - 40px))!important;display:block!important;';
    const root = notice.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      *{box-sizing:border-box}section{position:relative;background:#f8f7f2;color:#202b25;border:1px solid #d9ded4;border-radius:16px;padding:19px 44px 18px 20px;box-shadow:0 8px 36px #0002;font:14px/1.5 system-ui,sans-serif;text-align:left}
      .eyebrow{font-size:10px;letter-spacing:1.5px;font-weight:750;color:#64715f;margin-bottom:6px}strong{display:block;font-size:17px;letter-spacing:-.4px}p{margin:4px 0 14px;color:#657060;font-size:12px}a{display:inline-flex;gap:20px;align-items:center;background:#d4fa83;color:#253c2e;text-decoration:none;border-radius:8px;padding:9px 13px;font-weight:650;font-size:12px}a:hover{background:#c4ed70}button{position:absolute;top:12px;right:12px;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#657060;font:20px system-ui;cursor:pointer}button:hover{background:#e8ebdf}:focus-visible{outline:3px solid #648735;outline-offset:3px}
    </style><section aria-label="Pricing Peek"><div class="eyebrow">PRICING PEEK</div><div role="status"><strong>This site has a pricing page.</strong><p>Take a look before you dive in.</p></div><a>View pricing <span aria-hidden="true">↗</span></a><button type="button" aria-label="Dismiss pricing notice">×</button></section>`;
    updateNotice(destination);
    root.querySelector('a').addEventListener('click', reachPricing);
    root.querySelector('a').addEventListener('keydown', event => {
      if (!currentDestination.url && ['Enter', ' '].includes(event.key)) reachPricing(event);
    });
    root.querySelector('button').addEventListener('click', () => { dismissed = true; notice.remove(); });
    document.documentElement.append(notice);
  }

  const observer = new MutationObserver(records => {
    if (records.every(record => record.target === notice || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node === notice)))) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'id', 'hidden', 'open'] });
  window.addEventListener('popstate', scan);
  scan();
})();
