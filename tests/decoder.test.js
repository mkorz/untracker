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
