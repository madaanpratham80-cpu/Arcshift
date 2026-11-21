import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MongoClient, ObjectId } from 'mongodb';
import { createBrowser, expectJson } from './support/browser.js';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const databaseName = 'profile_integration';
const profilePath = '/api/profile';
const accountPassword = 'example password for profile testing';
let folder;
let mongo;
let api;
let database;
let origin;
let apiEnv;

const draft = {
  background: '  React developer with two course projects.  ',
  skills: ['React', ' react ', 'API', 'ＡＰＩ', 'Git'],
  targetRole: '  Backend developer  ',
  hoursPerWeek: 6.5,
  constraints: { budget: '  Free resources  ', notes: '  Weekends work best.  ' },
};

async function startApi() {
  api = await startProcess(process.execPath, ['dist/server.js'], { env: apiEnv });
  await waitForStatus(origin, '/readyz', 200);
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'career-agent-profile-'));
  const mongoPort = await getLoopbackPort();
  const apiPort = await getLoopbackPort();
  const uri = 'mongodb://127.0.0.1:' + mongoPort;
  origin = 'http://127.0.0.1:' + apiPort;
  apiEnv = {
    ...process.env, QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(apiPort),
    APP_ORIGIN: origin, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    MONGODB_URI: uri, MONGODB_DB: databaseName,
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
  };
  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', folder, '--nounixsocket',
    '--logpath', join(folder, 'mongod.log'),
  ]);
  await startApi();
  database = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 });
});

after(async () => {
  try {
    await Promise.all([stopProcess(api), database?.close()]);
  } finally {
    await stopProcess(mongo);
    if (folder) await rm(folder, { recursive: true, force: true });
  }
});

async function account(email) {
  const browser = createBrowser(origin);
  const signUp = await browser.request('/api/auth/register', {
    method: 'POST', json: { email, password: accountPassword },
  });
  const { data: { user } } = await expectJson(signUp, 201);
  return { browser, id: user.id };
}

function save(browser, expectedVersion, fields = draft, options = {}) {
  return browser.request(profilePath, { method: 'PUT', json: { expectedVersion, ...fields }, ...options });
}

async function currentProfile(browser, url = profilePath) {
  return (await expectJson(await browser.request(url), 200)).data.profile;
}

async function onboardingComplete(browser) {
  return (await expectJson(await browser.request('/api/auth/session'), 200)).data.onboardingComplete;
}

test('profile and onboarding state belong to the signed-in account', async () => {
  const guest = createBrowser(origin);
  assert.equal((await expectJson(await guest.request(profilePath), 401)).code, 'SIGN_IN_REQUIRED');
  assert.equal((await expectJson(await save(guest, 0), 401)).code, 'SIGN_IN_REQUIRED');

  const { browser: first, id: firstId } = await account('first-profile@example.test');
  const { browser: second } = await account('second-profile@example.test');
  assert.equal(await onboardingComplete(first), false);
  assert.equal(await currentProfile(first), null);

  const foreignOrigin = await save(first, 0, draft, { requestOrigin: 'https://foreign.example.test' });
  assert.equal((await expectJson(foreignOrigin, 403)).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(await onboardingComplete(first), false);

  const { data: { profile } } = await expectJson(await save(first, 0), 201);
  assert.deepEqual(profile, {
    background: 'React developer with two course projects.',
    skills: ['React', 'API', 'Git'],
    targetRole: 'Backend developer',
    hoursPerWeek: 6.5,
    constraints: { budget: 'Free resources', notes: 'Weekends work best.' },
    version: 1,
    createdAt: profile.createdAt,
    updatedAt: profile.createdAt,
  });
  assert.ok(Number.isFinite(Date.parse(profile.createdAt)));
  assert.equal(await onboardingComplete(first), true);
  assert.deepEqual(await currentProfile(first), profile);

  const otherQuery = profilePath + '?userId=' + firstId;
  assert.equal(await currentProfile(second, otherQuery), null);
  assert.equal(await onboardingComplete(second), false);
  const attemptedOwner = await save(second, 0, { ...draft, userId: firstId });
  assert.equal((await expectJson(attemptedOwner, 400)).code, 'VALIDATION_FAILED');
  const secondSaved = await expectJson(await save(second, 0, { ...draft, targetRole: 'Data analyst' }), 201);
  assert.deepEqual(await currentProfile(second, otherQuery), secondSaved.data.profile);
  assert.deepEqual(await currentProfile(first), profile);

  assert.equal((await first.request('/api/auth/logout', { method: 'POST' })).status, 204);
  assert.equal((await expectJson(await first.request(profilePath), 401)).code, 'SIGN_IN_REQUIRED');
});

test('invalid and oversized profile saves preserve onboarding state', async () => {
  const { browser } = await account('validation-profile@example.test');
  const invalid = await save(browser, -1, { ...draft, targetRole: ' ', hoursPerWeek: 169, skills: [' '] });
  const error = await expectJson(invalid, 400);
  assert.equal(error.code, 'VALIDATION_FAILED');
  for (const field of ['expectedVersion', 'targetRole', 'hoursPerWeek', 'skills']) {
    assert.ok(error.fieldErrors[field].length > 0);
  }

  const large = await save(browser, 0, { ...draft, background: 'x'.repeat(65_536) });
  assert.equal((await expectJson(large, 413)).code, 'VALIDATION_FAILED');
  assert.equal(await currentProfile(browser), null);
  assert.equal(await onboardingComplete(browser), false);

  const valid = { background: 'Starting my first career plan.', targetRole: 'Software engineer', hoursPerWeek: 0, skills: [] };
  const { data: { profile } } = await expectJson(await save(browser, 0, valid), 201);
  assert.deepEqual(profile.constraints, {});
  assert.equal(profile.hoursPerWeek, 0);
  assert.deepEqual(profile.skills, []);
});

test('concurrent creation and edits preserve one committed version across restart', async () => {
  const { browser, id } = await account('concurrent-profile@example.test');
  const missing = await save(browser, 1);
  assert.equal((await expectJson(missing, 409)).code, 'PROFILE_VERSION_CONFLICT');
  assert.equal(await currentProfile(browser), null);

  const firstWrites = await Promise.all([
    save(browser, 0, { ...draft, targetRole: 'Backend developer' }),
    save(browser, 0, { ...draft, targetRole: 'Platform developer' }),
  ]);
  assert.deepEqual(firstWrites.map((response) => response.status).sort(), [201, 409]);
  const created = await currentProfile(browser);
  assert.equal(created.version, 1);

  const profiles = database.db(databaseName).collection('careerProfiles');
  assert.equal(await profiles.countDocuments({ userId: new ObjectId(id) }), 1);
  assert.equal((await profiles.indexes()).find((index) => index.name === 'career_profiles_user_unique').unique, true);

  const nextWrites = await Promise.all([
    save(browser, 1, { ...draft, targetRole: 'API developer', constraints: {} }),
    save(browser, 1, { ...draft, targetRole: 'Infrastructure engineer', constraints: { budget: ' ' } }),
  ]);
  assert.deepEqual(nextWrites.map((response) => response.status).sort(), [200, 409]);
  const { data: { profile } } = await expectJson(nextWrites.find((response) => response.status === 200), 200);
  const lost = await expectJson(nextWrites.find((response) => response.status === 409), 409);
  assert.equal(lost.code, 'PROFILE_VERSION_CONFLICT');
  assert.equal(profile.version, 2);
  assert.equal(profile.createdAt, created.createdAt);
  assert.ok(Date.parse(profile.updatedAt) >= Date.parse(created.updatedAt));
  assert.deepEqual(profile.constraints, {});
  assert.deepEqual(await currentProfile(browser), profile);

  assert.deepEqual(await stopProcess(api), [0, null]);
  await startApi();
  assert.deepEqual(await currentProfile(browser), profile);
  assert.equal(await onboardingComplete(browser), true);
});
