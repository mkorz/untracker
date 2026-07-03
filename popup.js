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
    resultMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');
    navigateBtn.classList.add('hidden');
    navigateBtn.disabled = true;
    finalUrl = null;
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
      resultMessage.textContent = 'No encoded URL found.';
      resultMessage.classList.remove('hidden');
      return;
    }

    finalUrl = result.finalUrl;
    resultMessage.textContent = `Unwrapped ${result.hops} redirect(s) → ${result.finalUrl}`;
    resultMessage.classList.remove('hidden');
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
