import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import express from 'express';
import { decodeJwt, SignJWT } from 'jose';
import { MongoClient, ObjectId } from 'mongodb';
import { createApp } from '../dist/app.js';
import { readAuthConfig } from '../dist/auth/config.js';
import { createAuthRouter } from '../dist/auth/routes.js';
import { createMongoDatabase } from '../dist/db/mongo.js';
import { createBrowser, expectJson } from './support/browser.js';
import { createGoogleFixture } from './support/google-fixture.js';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const password = 'example correct horse password';
const email = 'account@example.test';
const signingKey = randomBytes(32);
const googleOrigin = 'https://career-agent.example.test';
let folder;
let mongo;
let api;
let client;
let googleDatabase;
let googleServer;
let localOrigin;
let googleTransport;
let googleFixture;

const browser = (transport, origin = transport) => createBrowser(transport, origin, '/api/auth');

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'career-agent-auth-'));
  const mongoPort = await getLoopbackPort();
  const port = await getLoopbackPort();
  const uri = 'mongodb://127.0.0.1:' + mongoPort;
  localOrigin = 'http://127.0.0.1:' + port;
  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', folder, '--nounixsocket',
    '--logpath', join(folder, 'mongod.log'),
  ]);
  api = await startProcess(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env, QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), MONGODB_URI: uri, MONGODB_DB: 'auth_integration',
      APP_ORIGIN: localOrigin, JWT_SIGNING_KEY: signingKey.toString('base64url'),
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
    },
  });
  await waitForStatus(localOrigin, '/readyz', 200);
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 });
  googleDatabase = createMongoDatabase({ MONGODB_URI: uri, MONGODB_DB: 'google_integration' });
  const config = readAuthConfig({
    APP_ORIGIN: googleOrigin, JWT_SIGNING_KEY: signingKey.toString('base64url'),
    GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret',
  });
  googleFixture = await createGoogleFixture(config.google);
  const routes = express.Router();
  routes.use('/auth', createAuthRouter(googleDatabase.db, config, googleDatabase.checkReadiness, googleFixture.provider));
  googleServer = createApp(routes, googleDatabase.checkReadiness).listen(0, '127.0.0.1');
  await once(googleServer, 'listening');
  googleTransport = 'http://127.0.0.1:' + googleServer.address().port;
});

after(async () => {
  try {
    if (googleServer?.listening) {
      await new Promise((resolve, reject) => googleServer.close((error) => (error ? reject(error) : resolve())));
    }
    await Promise.all([client?.close(), googleDatabase?.close(), stopProcess(api)]);
  } finally {
    await stopProcess(mongo);
    if (folder) await rm(folder, { recursive: true, force: true });
  }
});

test('local accounts protect secrets, rotate refresh tokens, and revoke the current session', async () => {
  const first = browser(localOrigin);
  const register = (json, options = {}) => first.request('/register', { method: 'POST', json, ...options });
  assert.equal((await expectJson(await first.request('/session'), 401)).code, 'SIGN_IN_REQUIRED');
  assert.equal((await expectJson(await register({ email, password }, { requestOrigin: null }), 403)).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await expectJson(await register({ email, password: 'short' }), 400)).code, 'VALIDATION_FAILED');
  assert.equal((await expectJson(await register({ email, password: 'é'.repeat(37) }), 400)).code, 'VALIDATION_FAILED');
  const malformed = await first.request('/register', { method: 'POST', body: '{"email":' });
  assert.equal((await expectJson(malformed, 400)).code, 'VALIDATION_FAILED');
  const registered = await register({ email: ' Account@Example.Test ', password });
  const { data: { user } } = await expectJson(registered, 201);
  assert.deepEqual(user, { id: user.id, email, signInMethods: ['password'] });
  assert.ok(registered.headers.getSetCookie().every((value) => value.includes('HttpOnly') && value.includes('SameSite=Lax')));
  assert.ok(registered.headers.getSetCookie().every((value) => !value.includes('Secure')));
  assert.equal((await expectJson(await register({ email, password }), 409)).code, 'ACCOUNT_CREATION_FAILED');

  const db = client.db('auth_integration');
  const saved = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
  assert.match(saved.passwordHash, /^\$2b\$12\$/);
  assert.equal(await bcrypt.compare(password, saved.passwordHash), true);
  assert.equal('password' in saved, false);

  const current = await expectJson(await first.request('/session'), 200);
  assert.deepEqual(current.data.user, user);
  const original = new Map(first.cookies);
  const accessJwt = original.get('career_access');
  const access = decodeJwt(accessJwt);
  const stored = await db.collection('authSessions').findOne({ _id: new ObjectId(access.sid) });
  const oldRefresh = original.get('career_refresh');
  assert.equal(stored.refreshTokenHash, createHash('sha256').update(oldRefresh).digest('hex'));
  assert.equal(JSON.stringify(stored).includes(oldRefresh), false);

  const badJwt = accessJwt.split('.');
  badJwt[2] = (badJwt[2][0] === 'A' ? 'B' : 'A') + badJwt[2].slice(1);
  const invalid = await first.request('/session', { sentCookies: new Map([['career_access', badJwt.join('.')]]) });
  assert.equal((await expectJson(invalid, 401)).code, 'SIGN_IN_REQUIRED');
  const expired = await new SignJWT({ sid: access.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(access.iss).setAudience(access.aud)
    .setSubject(user.id).setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(signingKey);
  const expiredResponse = await first.request('/session', { sentCookies: new Map([['career_access', expired]]) });
  assert.equal((await expectJson(expiredResponse, 401)).code, 'SIGN_IN_REQUIRED');

  const refresh = () => first.request('/refresh', { method: 'POST', sentCookies: original });
  const responses = await Promise.all([refresh(), refresh()]);
  assert.deepEqual(responses.map((entry) => entry.status).sort(), [200, 401]);
  const rejected = responses.find((entry) => entry.status === 401);
  assert.equal(rejected.headers.getSetCookie().length, 0);
  assert.notEqual(first.cookies.get('career_refresh'), oldRefresh);
  const reused = await refresh();
  assert.equal((await expectJson(reused, 401)).code, 'SIGN_IN_REQUIRED');

  const second = browser(localOrigin);
  const wrong = await expectJson(await second.request('/login', { method: 'POST', json: { email, password: 'wrong' } }), 401);
  const unknown = await expectJson(await second.request('/login', { method: 'POST', json: { email: 'unknown@example.test', password: 'wrong' } }), 401);
  assert.equal(wrong.code, 'INVALID_CREDENTIALS');
  assert.equal(wrong.message, unknown.message);
  assert.deepEqual((await expectJson(await second.request('/login', { method: 'POST', json: { email, password } }), 200)).data.user, user);

  const beforeLogout = new Map(first.cookies);
  assert.equal((await first.request('/logout', { method: 'POST', requestOrigin: 'https://foreign.example.test' })).status, 403);
  assert.equal((await first.request('/logout', { method: 'POST' })).status, 204);
  assert.equal(first.cookies.size, 0);
  assert.equal((await first.request('/session', { sentCookies: beforeLogout })).status, 401);
  assert.equal((await first.request('/refresh', { method: 'POST', sentCookies: beforeLogout })).status, 401);
  assert.equal((await second.request('/session')).status, 200);
  assert.equal((await expectJson(await second.request('/google/start'), 503)).code, 'GOOGLE_UNAVAILABLE');
});

test('Google sign-in validates callback state, creates accounts by subject, and requires explicit linking', async () => {
  const googleBrowser = () => browser(googleTransport, googleOrigin);
  let nextCode = 0;
  async function start(target) {
    const response = await target.request('/google/start');
    assert.equal(response.status, 302);
    assert.match(response.headers.getSetCookie()[0], /^__Host-career_google=.+; Path=\/.*; HttpOnly; Secure; SameSite=Lax$/);
    return new URL(response.headers.get('location'));
  }
  async function callback(target, authorization, claims = {}, sentState) {
    const code = 'fixture-code-' + ++nextCode;
    googleFixture.addCode(code, { nonce: authorization.searchParams.get('nonce'), ...claims });
    const query = new URLSearchParams({ code, state: sentState ?? authorization.searchParams.get('state') });
    const response = await target.request('/google/callback?' + query);
    assert.equal(response.status, 303);
    return response.headers.get('location');
  }

  const federated = googleBrowser();
  const url = await start(federated);
  assert.equal(await callback(federated, url, {}, 'different-state'), '/?auth=google_failed');
  assert.equal((await federated.request('/session')).status, 401);
  assert.equal(await callback(federated, url, { nonce: 'different-nonce' }), '/?auth=google_failed');
  assert.equal(await callback(federated, await start(federated)), '/?auth=google_signed_in');
  const googleUser = (await expectJson(await federated.request('/session'), 200)).data.user;
  assert.deepEqual(googleUser.signInMethods, ['google']);

  const returning = googleBrowser();
  const googleStart = await returning.request('/google/start', { headers: { Accept: 'application/json' } });
  const returnedUrl = new URL((await expectJson(googleStart, 200)).data.authorizationUrl);
  assert.equal(returnedUrl.origin, 'https://accounts.google.com');
  assert.equal(await callback(returning, returnedUrl, { email: 'changed@example.test' }), '/?auth=google_signed_in');
  assert.equal((await expectJson(await returning.request('/session'), 200)).data.user.id, googleUser.id);

  const local = googleBrowser();
  const localSession = await local.request('/register', { method: 'POST', json: { email, password } });
  assert.ok(localSession.headers.getSetCookie().every((value) => value.startsWith('__Host-') && value.includes('Secure')));
  const localUser = (await expectJson(localSession, 201)).data.user;

  const claimant = googleBrowser();
  const claims = { email, subject: 'local-link-subject' };
  assert.equal(await callback(claimant, await start(claimant), claims), '/?auth=google_link_required');
  assert.equal((await claimant.request('/session')).status, 401);
  assert.equal((await local.request('/google/link', { method: 'POST', json: { password: 'wrong' } })).status, 401);
  const requestLink = () => local.request('/google/link', { method: 'POST', json: { password } });
  const pending = (await expectJson(await requestLink(), 200)).data.authorizationUrl;
  claimant.cookies.set('__Host-career_google', local.cookies.get('__Host-career_google'));
  assert.equal(await callback(claimant, new URL(pending), claims), '/?auth=google_failed');
  const authorization = (await expectJson(await requestLink(), 200)).data.authorizationUrl;
  assert.equal(await callback(local, new URL(authorization), claims), '/?auth=google_linked');
  assert.deepEqual((await expectJson(await local.request('/session'), 200)).data.user.signInMethods, ['password', 'google']);
  assert.equal(await callback(claimant, await start(claimant), claims), '/?auth=google_signed_in');
  assert.equal((await expectJson(await claimant.request('/session'), 200)).data.user.id, localUser.id);
});

test('password attempt rate limits leave session reads available', async () => {
  const anonymous = browser(localOrigin);
  let code;
  for (let i = 0; i < 31; i++) {
    const response = await anonymous.request('/login', { method: 'POST', json: {} });
    code = (await response.json()).code;
    if (response.status === 429) {
      assert.ok(response.headers.get('ratelimit'));
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.equal(code, 'RATE_LIMITED');
  assert.equal((await anonymous.request('/session')).status, 401);
});
