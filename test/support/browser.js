import assert from 'node:assert/strict';

export function createBrowser(transport, origin = transport, prefix = '') {
  const cookies = new Map();
  return {
    cookies,
    async request(path, options = {}) {
      const { method = 'GET', json, body, requestOrigin = origin,
        sentCookies = cookies, saveCookies = true, headers: extraHeaders } = options;
      const headers = new Headers(extraHeaders);
      if (requestOrigin) headers.set('Origin', requestOrigin);
      if (sentCookies.size) {
        headers.set('Cookie', [...sentCookies].map(([name, value]) => name + '=' + value).join('; '));
      }
      if (json !== undefined || body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await fetch(transport + prefix + path, {
        method, headers, body: json === undefined ? body : JSON.stringify(json), redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      if (saveCookies) {
        for (const raw of response.headers.getSetCookie()) {
          const [name, value] = raw.split(';')[0].split('=');
          if (value) cookies.set(name, value);
          else cookies.delete(name);
        }
      }
      return response;
    },
  };
}

export async function expectJson(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
