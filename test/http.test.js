import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApp } from '../dist/app.js';

let server;
let origin;
let databaseReady = false;

before(async () => {
  const routes = express.Router();

  routes.get('/test-failure', async () => {
    throw new Error('Private provider detail');
  });

  server = createApp(routes, async () => databaseReady).listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = new URL(`http://127.0.0.1:${server.address().port}`);
});

after(async () => {
  if (!server?.listening) return;

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('health reports process liveness and issues a fresh request ID', async () => {
  const url = new URL('/healthz', origin);
  const response = await fetch(url, { headers: { 'X-Request-Id': 'client-supplied' } });
  const second = await fetch(url);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.deepEqual(await response.json(), { data: { status: 'ok' } });
  assert.deepEqual(await second.json(), { data: { status: 'ok' } });

  const requestId = response.headers.get('x-request-id');
  assert.match(requestId ?? '', /^[\da-f-]{36}$/i);
  assert.notEqual(second.headers.get('x-request-id'), requestId);
});

test('unknown API routes return JSON 404 with a matching request ID', async () => {
  const response = await fetch(new URL('/api/unknown', origin));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    code: 'NOT_FOUND',
    message: 'This resource is unavailable.',
    requestId: response.headers.get('x-request-id'),
  });
});

test('an unexpected async handler error returns a generic JSON 500', async () => {
  const response = await fetch(new URL('/api/test-failure', origin));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Try again.',
    requestId: response.headers.get('x-request-id'),
  });
});

test('readiness follows database state while liveness remains available', async () => {
  const readyUrl = new URL('/readyz', origin);
  const unavailable = await fetch(readyUrl);

  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), {
    code: 'NOT_READY',
    message: 'The service is temporarily unavailable.',
    requestId: unavailable.headers.get('x-request-id'),
  });

  const healthy = await fetch(new URL('/healthz', origin));
  assert.equal(healthy.status, 200);
  await healthy.json();

  databaseReady = true;
  try {
    const available = await fetch(readyUrl);
    assert.equal(available.status, 200);
    assert.equal(available.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await available.json(), { data: { status: 'ready' } });
  } finally {
    databaseReady = false;
  }

  const interrupted = await fetch(readyUrl);
  assert.equal(interrupted.status, 503);
  await interrupted.json();
});
