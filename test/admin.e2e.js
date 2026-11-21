import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { chromium } from 'playwright';
import { createAdminRouter } from '../dist/admin/routes.js';
import { createApp } from '../dist/app.js';
import { readAuthConfig } from '../dist/auth/config.js';
import { createAuthRouter } from '../dist/auth/routes.js';
import { createMongoDatabase } from '../dist/db/mongo.js';
import { createGoogleFixture } from './support/google-fixture.js';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const ownerEmail = 'arcshift.owner.test@gmail.com';

test('private operations dashboard and public 404 and terms pages', { timeout: 50_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'arcshift-admin-test-'));
  let browser, mongo, server, database;
  t.after(async () => {
    try {
      await browser?.close();
      if (server?.listening) await new Promise((done) => server.close(done));
      await database?.close();
    } finally {
      await stopProcess(mongo);
      await rm(dir, { recursive: true, force: true });
    }
  });
  const mongoPort = await getLoopbackPort();
  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', dir,
    '--nounixsocket', '--logpath', join(dir, 'mongod.log'),
  ]);
  const port = await getLoopbackPort();
  const origin = 'http://127.0.0.1:' + port;
  database = createMongoDatabase({ MONGODB_URI: 'mongodb://127.0.0.1:' + mongoPort, MONGODB_DB: 'admin_e2e' });
  const config = readAuthConfig({
    APP_ORIGIN: origin, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret',
    ARCSHIFT_ADMIN_EMAIL: ownerEmail,
  });
  const fixture = await createGoogleFixture(config.google);
  const api = express.Router();
  api.use('/auth', createAuthRouter(database.db, config, database.checkReadiness, fixture.provider));
  api.use('/admin', createAdminRouter(database.db, config, database.checkReadiness));
  server = createApp(api, database.checkReadiness, resolve('dist/web')).listen(port, '127.0.0.1');
  await once(server, 'listening');
  await waitForStatus(origin, '/readyz', 200);

  browser = await chromium.launch(process.env.CAREER_BROWSER_CHANNEL ? { channel: process.env.CAREER_BROWSER_CHANNEL } : {});
  const guest = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  assert.equal((await guest.request.get(origin + '/api/admin/overview')).status(), 401);
  await guest.goto(origin + '/admin');
  await guest.getByRole('link', { name: 'Sign in to admin' }).waitFor();
  assert.equal((await guest.request.post(origin + '/api/auth/register', { headers: { Origin: origin },
    data: { email: ownerEmail, password: 'synthetic strong password' } })).status(), 409);

  async function signIn(page, email, subject) {
    const start = await page.request.get(origin + '/api/auth/google/start?next=admin', { headers: { Accept: 'application/json' } });
    const url = new URL((await start.json()).data.authorizationUrl);
    fixture.addCode(subject, { subject, email, nonce: url.searchParams.get('nonce') });
    const query = new URLSearchParams({ code: subject, state: url.searchParams.get('state') });
    await page.goto(origin + '/api/auth/google/callback?' + query);
    assert.equal(new URL(page.url()).pathname, '/admin');
  }

  await signIn(guest, 'other@example.test', 'different-google-subject');
  assert.equal((await guest.request.get(origin + '/api/admin/overview')).status(), 403);
  await guest.getByRole('link', { name: 'Sign in to admin' }).waitFor();

  const owner = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await signIn(owner, ownerEmail, 'admin-google-subject');
  const time = Date.now();
  const ids = Array.from({ length: 13 }, () => new ObjectId());
  await database.db.collection('users').insertMany(ids.map((_id, index) => ({
    _id, emailCanonical: 'synthetic-' + index + '@example.test', createdAt: new Date(time - index * 86_400_000),
  })));
  await database.db.collection('roadmaps').insertMany(ids.slice(0, 8).map((userId, index) => ({
    userId, createdAt: new Date(time - index * 86_400_000),
  })));
  await database.db.collection('aiRuns').insertMany(['succeeded', 'failed', 'succeeded'].map((status, index) => ({ userId: ids[index], key: 'synthetic-' + index, kind: 'initial_roadmap', status })));
  const overview = await owner.request.get(origin + '/api/admin/overview');
  assert.equal(overview.status(), 200);
  assert.equal(overview.headers()['cache-control'], 'no-store');
  const { data } = await overview.json();
  assert.equal(data.accounts, 15);
  assert.equal(data.roadmaps, 8);
  assert.equal(data.activity.length, 14);
  assert.equal(data.jobs.succeeded, 2);
  await signIn(guest, ownerEmail, 'different-google-subject');
  assert.equal((await guest.request.get(origin + '/api/admin/overview')).status(), 403);

  await owner.reload();
  await owner.getByRole('heading', { name: 'Workspace activity' }).waitFor();
  const screens = process.env.CAREER_ADMIN_SCREENSHOTS;
  if (screens) {
    await mkdir(screens, { recursive: true });
    await owner.screenshot({ path: join(screens, 'admin.png'), fullPage: true });
  }
  await owner.context().clearCookies({ name: 'career_access' });
  await owner.reload();
  await owner.getByRole('heading', { name: 'AI runs' }).waitFor();
  await owner.setViewportSize({ width: 390, height: 844 });
  assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await owner.getByText('View daily totals').click();
  assert.equal(await owner.getByRole('table').getByRole('row').count(), 15);

  for (const path of ['/missing', '/app/missing']) {
    assert.equal((await guest.goto(origin + path)).status(), 404);
    await guest.getByRole('heading', { name: 'Page not found' }).waitFor();
  }
  await guest.getByRole('link', { name: 'Terms and Conditions' }).click();
  await guest.getByRole('heading', { name: 'Terms and Conditions' }).waitFor();
  assert.equal((await guest.request.get(origin + '/assets/missing.js')).status(), 404);
  assert.equal((await guest.request.get(origin + '/api/missing')).status(), 404);
});
