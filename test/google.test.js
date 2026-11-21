import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { before, test } from 'node:test';
import { readAuthConfig } from '../dist/auth/config.js';
import { createGoogleFlow, readGoogleFlow, signGoogleFlow } from '../dist/auth/google.js';
import { createGoogleFixture } from './support/google-fixture.js';

const config = {
  clientId: 'test-client',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};
let fixture;

before(async () => { fixture = await createGoogleFixture(config); });

test('auth config requires a strong signing key and permits only HTTPS or loopback HTTP', () => {
  const env = { JWT_SIGNING_KEY: randomBytes(32).toString('base64url') };
  assert.equal(readAuthConfig({}), undefined);
  assert.throws(() => readAuthConfig({ ...env, APP_ORIGIN: 'http://career.example.test' }), /APP_ORIGIN/);
  assert.throws(() => readAuthConfig({ APP_ORIGIN: 'http://localhost:3000', JWT_SIGNING_KEY: 'short' }), /JWT_SIGNING_KEY/);
  assert.equal(readAuthConfig({ ...env, APP_ORIGIN: 'http://localhost:3000' }).secureCookies, false);
  assert.throws(() => readAuthConfig({ ...env, APP_ORIGIN: 'http://localhost:3000', NODE_ENV: 'production' }), /APP_ORIGIN/);
  assert.equal(readAuthConfig({ ...env, APP_ORIGIN: 'https://career.example.test' }).secureCookies, true);
  assert.throws(() => readAuthConfig({
    ...env, APP_ORIGIN: 'https://career.example.test', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'https://different.example.test/api/auth/google/callback',
  }), /GOOGLE_REDIRECT_URI/);
});

test('Google flow is signed, audience-bound, and generates an S256 challenge', async () => {
  const auth = { jwtKey: randomBytes(32) };
  const flow = createGoogleFlow({ mode: 'signin' });
  const nextFlow = createGoogleFlow({ mode: 'signin' });
  assert.notEqual(flow.state, nextFlow.state);
  const token = await signGoogleFlow(flow, auth);
  assert.deepEqual(await readGoogleFlow(token, auth), flow);
  assert.equal(await readGoogleFlow(token, { jwtKey: randomBytes(32) }), undefined);

  const url = new URL(fixture.provider.authorizationUrl(flow));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('state'), flow.state);
  assert.equal(url.searchParams.get('nonce'), flow.nonce);
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(flow.verifier).digest('base64url'));

  const grant = fixture.addCode('valid', { nonce: flow.nonce });
  assert.deepEqual(await fixture.provider.exchangeIdentity('valid', flow), {
    subject: 'test-google-subject', email: 'new-google@example.test',
  });
  assert.equal(grant.request.method, 'POST');
  assert.equal(grant.request.redirect, 'error');
  assert.equal(grant.request.body.get('code_verifier'), flow.verifier);
  assert.equal(grant.request.body.get('redirect_uri'), config.redirectUri);
});

test('Google ID token validation rejects wrong or unverified claims', async () => {
  const flow = createGoogleFlow({ mode: 'signin' });
  const cases = [
    ['nonce', { nonce: 'different-nonce' }],
    ['issuer', { issuer: 'https://wrong.example.test' }],
    ['audience', { audience: 'wrong-client' }],
    ['authorized party', { audience: [config.clientId, 'other-client'], authorizedParty: 'other-client' }],
    ['email', { emailVerified: false }],
    ['expired', { expiration: Math.floor(Date.now() / 1_000) - 10 }],
    ['signature', { tamperSignature: true }],
  ];
  for (const [code, overrides] of cases) {
    fixture.addCode(code, { nonce: flow.nonce, ...overrides });
    await assert.rejects(fixture.provider.exchangeIdentity(code, flow));
  }
});
