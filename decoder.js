const MAX_HOPS = 5;

function isHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
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
    } catch {
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
    throw new Error('INVALID_URL', { cause: e });
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
