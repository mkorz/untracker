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

```bash
node --test
```

## Linting

```bash
npm install
npm run lint
```

CI runs both the tests and the linter on every push and pull request (see
`.github/workflows/ci.yml`).
