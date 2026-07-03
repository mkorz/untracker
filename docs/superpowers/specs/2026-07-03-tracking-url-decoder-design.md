# Tracking URL Decoder — Design

## Problem

Many articles/pages link through tracking/redirect services (ad networks,
affiliate networks, etc.) that embed the real destination URL as an encoded
query parameter, e.g.:

```
https://tracking.example-ads.test/v1/redirect?type=url&url=https%3A%2F%2Fshop.example.test%2Fdeals%2Fpage%2F8&api_key=...&site_id=...
```

An adblocker often blocks the tracking domain outright, so the page never
loads and the real destination is unreachable — even though the destination
itself is perfectly fine to visit. The blocked param's *name* is not
standardized (`url`, `u`, `target`, `redirect`, ...), and services are
sometimes chained (a tracking URL wrapping another tracking URL).

## Goal

A private, personal-use Chrome extension (Manifest V3) that:

- Reads the current tab's URL (or accepts a pasted URL when there's nothing
  useful to read, e.g. a new tab).
- Scans it for a query parameter whose value — once percent-decoded and/or
  base64-decoded — is itself a valid `http(s)://` URL.
- Repeats this unwrapping iteratively (up to 5 hops, to handle chained
  redirect services) until no further encoded target is found.
- Lets the user review the final decoded URL, then navigates the current
  tab there.

Not a goal: publishing to the Chrome Web Store, automatic/background
redirecting, or supporting encodings beyond percent-encoding and base64
(standard + base64url variants).

## Architecture

Three pieces, no content scripts, no background service worker:

- **`manifest.json`** (Manifest V3) — declares a toolbar popup action.
  Only permission: `activeTab`. No `host_permissions` — the extension never
  needs to read page contents or make network requests, only the tab's URL
  string, which `activeTab` exposes for the tab the user is looking at when
  they click the icon.
- **`popup.html` / `popup.js` / `popup.css`** — the UI described below.
- **`decoder.js`** — pure decoding logic (no Chrome API calls), so it can be
  unit tested standalone (e.g. via Node) independent of the extension
  runtime.

## Decode algorithm

Input: a URL string. Output: `{ finalUrl, hops }`.

Repeat up to 5 times:

1. Parse the current URL with `new URL(...)`. If parsing fails, stop
   (invalid input).
2. Iterate its `searchParams` in order. For each `[key, value]`:
   a. If `value` starts with `http://` or `https://` (case-insensitive) and
      `new URL(value)` succeeds → this is the candidate. (Percent-encoding
      is already decoded automatically by `URLSearchParams`.)
   b. Otherwise, try base64-decoding `value` (try standard base64, then the
      base64url variant with `-`/`_` swapped back to `+`/`/` and padding
      restored). If the decoded string starts with `http://`/`https://` and
      parses as a valid URL → this is the candidate.
3. Take the **first** param (in URL order) that produced a candidate. Set
   it as the new "current URL", increment `hops`, and loop again.
4. If no param in the current pass produced a candidate, stop — the
   current URL is final.

Stops early on no-candidate-found, or after 5 hops, whichever comes first.
`hops === 0` means nothing decodable was found in the original URL.

## Popup UX flow

1. On open, query the active tab's URL (`chrome.tabs.query`). If it's a
   normal `http(s)` URL, prefill the text field with it. If it's
   `chrome://newtab` (or otherwise not a usable http(s) URL), leave the
   field empty with a placeholder ("Paste a URL…").
2. The field is always editable — the user can paste over the prefilled
   value.
3. **Decode** button runs the algorithm against the (trimmed) field value:
   - `hops > 0` → show "Unwrapped N redirect(s) → `<finalUrl>`" and enable
     **Navigate**.
   - `hops === 0` → show "No encoded URL found", **Navigate** stays
     disabled.
   - Input isn't a parseable URL at all → show "Please enter a valid URL".
4. **Navigate** button: `chrome.tabs.update(tabId, { url: finalUrl })`,
   then close the popup.

No auto-redirect, no background scanning — everything is user-initiated
from the popup.

## Testing

- `decoder.js` has no Chrome API dependency, so it gets a small Node-based
  test script covering:
  - The example tracking URL above (percent-encoded, 1 hop).
  - A synthetic 2-hop chain (a tracking URL wrapping another tracking URL).
  - A base64/base64url-encoded target param.
  - A URL with no decodable param (0 hops expected).
  - Malformed/invalid input (should not throw; should surface as "invalid
    URL" case).
- Manual verification: load the extension unpacked via
  `chrome://extensions`, open the example tracking URL, click
  Decode → Navigate, confirm the tab lands on the real Kaufland page.

## Packaging

Personal-use only — no Chrome Web Store listing. Loaded unpacked via
`chrome://extensions` → "Load unpacked". A short README will document this
install step.
