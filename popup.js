const hostLabel = document.querySelector('#host');
const toggle = document.querySelector('#enabled');
const clean = document.querySelector('#clean');
const status = document.querySelector('#status');
let tab;
let host;
function report(result) {
  status.textContent = !result.enabled ? 'Paused on this site.' : result.count ? `${result.count} login prompt${result.count === 1 ? '' : 's'} cleared on this page.` : 'Watching for login prompts. No matching overlays found yet.';
}
async function connect() {
  try { return await chrome.tabs.sendMessage(tab.id, { type: 'status' }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type: 'status' });
  }
}
(async () => {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Open a website to use Just Scroll.');
    host = url.hostname; hostLabel.textContent = host;
    const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
    toggle.checked = !pausedHosts.includes(host);
    report(await connect());
    toggle.disabled = false; clean.disabled = !toggle.checked;
  } catch (error) {
    hostLabel.textContent = 'Unavailable on this page';
    status.textContent = 'Open a regular website tab. Chrome internal pages and the Web Store cannot be modified.';
  }
})();
toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  try {
    const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
    const next = new Set(pausedHosts);
    if (toggle.checked) next.delete(host); else next.add(host);
    await chrome.storage.local.set({ pausedHosts: [...next] });
    clean.disabled = !toggle.checked;
    status.textContent = toggle.checked ? 'Blocking enabled on this site.' : 'Paused. Hidden prompts have been restored.';
  } catch { status.textContent = 'Could not save this setting. Reopen the extension to retry.'; }
  finally { toggle.disabled = false; }
});
clean.addEventListener('click', async () => {
  try { report(await chrome.tabs.sendMessage(tab.id, { type: 'clean' })); }
  catch { status.textContent = 'The page changed. Reopen the extension to reconnect.'; }
});
