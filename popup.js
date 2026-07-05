document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  const decodeBtn = document.getElementById('decodeBtn');
  const navigateBtn = document.getElementById('navigateBtn');
  const resultMessage = document.getElementById('resultMessage');
  const errorMessage = document.getElementById('errorMessage');

  let currentTabId = null;
  let finalUrl = null;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) {
      return;
    }
    currentTabId = tab.id;
    if (tab.url && /^https?:\/\//i.test(tab.url)) {
      urlInput.value = tab.url;
    }
  });

  function resetOutputs() {
    resultMessage.textContent = '';
    resultMessage.className = 'result hidden';
    errorMessage.classList.add('hidden');
    navigateBtn.classList.add('hidden');
    navigateBtn.disabled = true;
    finalUrl = null;
  }

  // Renders the decoded destination with the hostname visually distinguished
  // from the rest of the URL. The URL is untrusted content, so every piece is
  // inserted via createElement + textContent — never innerHTML.
  function renderResult(hops, url) {
    resultMessage.className = 'result';

    const label = document.createElement('div');
    label.className = 'result__label';
    label.appendChild(document.createTextNode('Unwrapped '));
    const count = document.createElement('strong');
    count.textContent = String(hops);
    label.appendChild(count);
    label.appendChild(document.createTextNode(' redirect(s) to:'));

    // url is guaranteed to be a valid absolute URL here (decodeChain succeeded
    // with hops > 0), so new URL() is safe without a try/catch.
    const parsed = new URL(url);
    const hostPart = parsed.protocol + '//' + parsed.host;
    const pathPart = url.slice(hostPart.length);

    const urlEl = document.createElement('div');
    urlEl.className = 'result__url';

    const hostEl = document.createElement('span');
    hostEl.className = 'result__host';
    hostEl.textContent = hostPart;
    urlEl.appendChild(hostEl);

    if (pathPart) {
      const pathEl = document.createElement('span');
      pathEl.className = 'result__path';
      pathEl.textContent = pathPart;
      urlEl.appendChild(pathEl);
    }

    resultMessage.appendChild(label);
    resultMessage.appendChild(urlEl);
  }

  decodeBtn.addEventListener('click', () => {
    resetOutputs();
    const input = urlInput.value.trim();

    let result;
    try {
      result = decodeChain(input);
    } catch {
      errorMessage.textContent = 'Please enter a valid URL.';
      errorMessage.classList.remove('hidden');
      return;
    }

    if (result.hops === 0) {
      resultMessage.className = 'notice';
      resultMessage.textContent = 'No encoded URL found.';
      return;
    }

    finalUrl = result.finalUrl;
    renderResult(result.hops, result.finalUrl);
    navigateBtn.classList.remove('hidden');
    navigateBtn.disabled = false;
  });

  navigateBtn.addEventListener('click', () => {
    if (!finalUrl || currentTabId === null) {
      return;
    }
    chrome.tabs.update(currentTabId, { url: finalUrl });
    window.close();
  });
});
