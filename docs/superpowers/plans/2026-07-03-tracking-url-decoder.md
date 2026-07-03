# Tracking URL Decoder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, unpacked Chrome (Manifest V3) extension that unwraps redirect/tracking URLs — decoding percent-encoded or base64-encoded target parameters, iteratively up to 5 hops — and navigates the current tab to the real destination.

**Architecture:** A popup-only extension (no background service worker, no content scripts, no host permissions). `decoder.js` holds pure, Chrome-API-free decoding logic and is loaded both by the popup (as a classic `<script>`) and by a Node test suite (via `require`). `popup.js` wires the popup UI to `decoder.js` and to the `chrome.tabs` API.

**Tech Stack:** Vanilla JS, HTML, CSS. Manifest V3. Node.js built-in test runner (`node:test`) for `decoder.js` unit tests — no npm dependencies, no build step.

## Global Constraints

- Manifest V3, single permission: `activeTab`. No `host_permissions`, no content scripts, no background service worker.
- Decoding supports percent-encoding (via `URLSearchParams`, automatic) and base64/base64url only — no other encodings.
- Maximum 5 decode iterations ("hops") per `decodeChain` call.
- Personal use only: no Chrome Web Store packaging. Installed via "Load unpacked".
- No auto-redirect / no background scanning — every action is user-initiated from the popup (Decode, then Navigate).

---

### Task 1: `decodeChain` core — percent-encoding, chaining, cap, invalid input

**Files:**
- Create: `decoder.js`
- Create: `tests/decoder.test.js`

**Interfaces:**
- Produces: `decodeChain(urlString, maxHops = 5)` → `{ finalUrl: string, hops: number }`. Throws `Error('INVALID_URL')` if `urlString` cannot be parsed as a URL at all.

- [ ] **Step 1: Write the failing tests**

Create `tests/decoder.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeChain } = require('../decoder.js');

const DIGIDIP_URL =
  'https://tracking.example-ads.test/v1/redirect?type=url&url=https%3A%2F%2Fshop.example.test%2Fdeals%2Fpage%2F8&api_key=example00000000000000000000000&site_id=example00000000000000000000000&dch=feed&ad_t=advertiser&yk_tag=exampletag001';
const KAUFLAND_URL =
  'https://shop.example.test/deals/page/8';

test('decodes a single percent-encoded redirect', () => {
  const result = decodeChain(DIGIDIP_URL);
  assert.equal(result.finalUrl, KAUFLAND_URL);
  assert.equal(result.hops, 1);
});

test('returns 0 hops when there is nothing to decode', () => {
  const result = decodeChain('https://example.com/page?foo=bar');
  assert.equal(result.finalUrl, 'https://example.com/page?foo=bar');
  assert.equal(result.hops, 0);
});

test('throws INVALID_URL for unparseable input', () => {
  assert.throws(() => decodeChain('not a url'), /INVALID_URL/);
});

test('follows a chain of two redirects', () => {
  const outer = `https://tracking.example-ads.test/v1/redirect?type=url&url=${encodeURIComponent(
    DIGIDIP_URL
  )}`;
  const result = decodeChain(outer);
  assert.equal(result.finalUrl, KAUFLAND_URL);
  assert.equal(result.hops, 2);
});

test('stops after maxHops even if more redirects remain', () => {
  let url = KAUFLAND_URL;
  for (let i = 0; i < 7; i++) {
    url = `https://tracking.example.com/redirect?url=${encodeURIComponent(url)}`;
  }
  const result = decodeChain(url);
  assert.equal(result.hops, 5);
  assert.notEqual(result.finalUrl, KAUFLAND_URL);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/decoder.test.js`
Expected: FAIL — `Cannot find module '../decoder.js'`

- [ ] **Step 3: Write the implementation**

Create `decoder.js`:

```js
const MAX_HOPS = 5;

function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch (e) {
    return false;
  }
}

function findCandidate(urlString) {
  const url = new URL(urlString);
  for (const [, value] of url.searchParams) {
    if (isHttpUrl(value)) {
      return value;
    }
  }
  return null;
}

function decodeChain(urlString, maxHops = MAX_HOPS) {
  let current;
  try {
    current = new URL(urlString).toString();
  } catch (e) {
    throw new Error('INVALID_URL');
  }

  let hops = 0;
  for (let i = 0; i < maxHops; i++) {
    const candidate = findCandidate(current);
    if (!candidate) {
      break;
    }
    current = candidate;
    hops++;
  }

  return { finalUrl: current, hops };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decodeChain };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/decoder.test.js`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add decoder.js tests/decoder.test.js
git commit -m "Add decodeChain core: percent-encoding, chaining, hop cap"
```

---

### Task 2: Base64 / base64url support

**Files:**
- Modify: `decoder.js`
- Modify: `tests/decoder.test.js`

**Interfaces:**
- Consumes: nothing new — extends `findCandidate` (internal, not exported) used by `decodeChain` from Task 1.
- Produces: `decodeChain` (same signature) now also unwraps base64/base64url-encoded target params.

- [ ] **Step 1: Write the failing tests**

Append to `tests/decoder.test.js`:

```js
test('decodes a base64-encoded redirect target', () => {
  const target = 'https://example.com/deal?id=42';
  const encoded = Buffer.from(target, 'utf8').toString('base64');
  const trackingUrl = `https://ads.example.com/go?u=${encodeURIComponent(encoded)}`;
  const result = decodeChain(trackingUrl);
  assert.equal(result.finalUrl, target);
  assert.equal(result.hops, 1);
});

test('decodes a base64url-encoded redirect target', () => {
  const target = 'https://example.com/deal?id=42&ref=abc';
  const encoded = Buffer.from(target, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const trackingUrl = `https://ads.example.com/go?u=${encodeURIComponent(encoded)}`;
  const result = decodeChain(trackingUrl);
  assert.equal(result.finalUrl, target);
  assert.equal(result.hops, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/decoder.test.js`
Expected: FAIL on the two new tests — `finalUrl` still equals `trackingUrl` (base64 value doesn't look like an `http` URL yet, so `findCandidate` returns null and `hops` is 0)

- [ ] **Step 3: Write the implementation**

Replace `decoder.js` with:

```js
const MAX_HOPS = 5;

function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch (e) {
    return false;
  }
}

function base64UrlToStandard(value) {
  let output = value.replace(/-/g, '+').replace(/_/g, '/');
  while (output.length % 4 !== 0) {
    output += '=';
  }
  return output;
}

function base64Decode(value) {
  if (typeof atob === 'function') {
    return atob(value);
  }
  return Buffer.from(value, 'base64').toString('binary');
}

function tryDecodeBase64(value) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    return null;
  }
  const variants = [value, base64UrlToStandard(value)];
  for (const variant of variants) {
    try {
      const decoded = base64Decode(variant);
      if (isHttpUrl(decoded)) {
        return decoded;
      }
    } catch (e) {
      // not valid base64 in this variant, try the next one
    }
  }
  return null;
}

function findCandidate(urlString) {
  const url = new URL(urlString);
  for (const [, value] of url.searchParams) {
    if (isHttpUrl(value)) {
      return value;
    }
    const decoded = tryDecodeBase64(value);
    if (decoded) {
      return decoded;
    }
  }
  return null;
}

function decodeChain(urlString, maxHops = MAX_HOPS) {
  let current;
  try {
    current = new URL(urlString).toString();
  } catch (e) {
    throw new Error('INVALID_URL');
  }

  let hops = 0;
  for (let i = 0; i < maxHops; i++) {
    const candidate = findCandidate(current);
    if (!candidate) {
      break;
    }
    current = candidate;
    hops++;
  }

  return { finalUrl: current, hops };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decodeChain };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/decoder.test.js`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add decoder.js tests/decoder.test.js
git commit -m "Add base64/base64url support to decodeChain"
```

---

### Task 3: Extension manifest + static popup skeleton

**Files:**
- Create: `manifest.json`
- Create: `popup.html`
- Create: `popup.css`

**Interfaces:**
- Produces: DOM element ids consumed by Task 4's `popup.js`: `urlInput`, `decodeBtn`, `navigateBtn`, `resultMessage`, `errorMessage`. CSS class `hidden` toggles visibility; class `error` styles error text.

- [ ] **Step 1: Create the manifest**

Create `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Tracking URL Decoder",
  "version": "1.0.0",
  "description": "Decodes redirect/tracking URLs to find the real destination link, for use when an adblocker blocks the tracking domain.",
  "action": {
    "default_popup": "popup.html"
  },
  "permissions": ["activeTab"]
}
```

- [ ] **Step 2: Create the popup markup**

Create `popup.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tracking URL Decoder</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div class="popup">
    <label for="urlInput">Page URL</label>
    <input type="text" id="urlInput" placeholder="Paste a URL…" />

    <button id="decodeBtn" type="button">Decode</button>

    <p id="resultMessage" class="hidden"></p>
    <p id="errorMessage" class="hidden error"></p>

    <button id="navigateBtn" type="button" class="hidden" disabled>Navigate</button>
  </div>

  <script src="decoder.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the popup styles**

Create `popup.css`:

```css
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
}

.popup {
  width: 360px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-weight: 600;
}

#urlInput {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  font-family: monospace;
  font-size: 12px;
}

button {
  padding: 6px 10px;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

#resultMessage {
  word-break: break-all;
  font-family: monospace;
  font-size: 12px;
}

.error {
  color: #c0392b;
}

.hidden {
  display: none;
}
```

Note: `popup.html` references `decoder.js`, which doesn't exist as a standalone script yet in the popup's load path until this task — it already exists on disk from Task 1/2, so the `<script src="decoder.js">` tag will resolve correctly once loaded unpacked.

- [ ] **Step 4: Manually verify the skeleton renders**

Load the extension unpacked:
1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked", select this project's root folder.
4. Click the new toolbar icon.

Expected: a popup opens showing a "Page URL" label, an empty input with placeholder "Paste a URL…", and a "Decode" button. No JS errors in the popup's console (right-click popup → Inspect). Clicking "Decode" does nothing yet — that's expected, `popup.js` doesn't exist until Task 4.

- [ ] **Step 5: Commit**

```bash
git add manifest.json popup.html popup.css
git commit -m "Add manifest and static popup skeleton"
```

---

### Task 4: Wire popup interactivity

**Files:**
- Create: `popup.js`

**Interfaces:**
- Consumes: `decodeChain(urlString, maxHops?)` from `decoder.js` (Task 1/2); DOM ids from Task 3 (`urlInput`, `decodeBtn`, `navigateBtn`, `resultMessage`, `errorMessage`); `chrome.tabs.query` / `chrome.tabs.update`.
- Produces: fully interactive popup — prefill, Decode, Navigate.

- [ ] **Step 1: Create the popup script**

Create `popup.js`:

```js
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
    } catch (e) {
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
```

- [ ] **Step 2: Manually verify the interactive flow**

In `chrome://extensions`, click the reload icon on this extension to pick up `popup.js`. Then:

1. Open a new tab, click the toolbar icon, paste this URL into the field:
   `https://tracking.example-ads.test/v1/redirect?type=url&url=https%3A%2F%2Fshop.example.test%2Fdeals%2Fpage%2F8&api_key=example00000000000000000000000&site_id=example00000000000000000000000&dch=feed&ad_t=advertiser&yk_tag=exampletag001`
2. Click **Decode**. Expected: message reads `Unwrapped 1 redirect(s) → https://shop.example.test/deals/page/8`, and a **Navigate** button appears.
3. Click **Navigate**. Expected: the tab navigates to the Kaufland URL and the popup closes.
4. Reopen the popup on a plain page (e.g. `https://example.com`), click **Decode**. Expected: "No encoded URL found.", no Navigate button.
5. Clear the field, type `not a url`, click **Decode**. Expected: "Please enter a valid URL."

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "Wire popup interactivity to decoder and chrome.tabs"
```

---

### Task 5: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# Tracking URL Decoder

A private Chrome extension that unwraps redirect/tracking URLs (like ad
network or affiliate links) to find the real destination — useful when an
adblocker blocks the tracking domain itself and the link never loads.

## Install (unpacked, personal use only)

1. Open `chrome://extensions` in Chrome.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked" and select this project folder.

## Usage

1. Navigate to (or land on) a blocked tracking URL, or open a new tab.
2. Click the extension's toolbar icon.
3. The popup prefills the current tab's URL (or leave it blank/paste one on
   a new tab).
4. Click **Decode**. It unwraps up to 5 levels of redirects, trying
   percent-encoding and base64/base64url on each query parameter.
5. Review the resulting URL and hop count, then click **Navigate** to open
   it in the current tab.

## Running the tests

Requires Node.js 18+:

\`\`\`bash
node --test tests/
\`\`\`
```

- [ ] **Step 2: Run the full test suite one more time**

Run: `node --test tests/`
Expected: PASS — all 7 tests passing, 0 failures

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README with install and usage instructions"
```
