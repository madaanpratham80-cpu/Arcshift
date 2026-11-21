import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MongoClient } from 'mongodb';

import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

test('MongoDB startup creates indexes and readiness recovers after an outage', { timeout: 65_000 }, async (t) => {
  const dbPath = await mkdtemp(join(tmpdir(), 'career-agent-mongo-'));
  const clients = [];
  let mongo;
  let api;
  let conflictingApi;
  t.after(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await Promise.all([stopProcess(api), stopProcess(conflictingApi)]);
    await stopProcess(mongo);
    await rm(dbPath, { recursive: true, force: true });
  });

  const mongoPort = await getLoopbackPort();
  const apiPort = await getLoopbackPort();
  const uri = `mongodb://127.0.0.1:${mongoPort}`;
  const origin = `http://127.0.0.1:${apiPort}`;
  const testDatabase = 'career_agent_integration';
  const startApi = (port, name) => startProcess(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env, NODE_ENV: 'test', QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '',
      APP_ORIGIN: '', JWT_SIGNING_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
      HOST: '127.0.0.1', PORT: String(port), MONGODB_URI: uri, MONGODB_DB: name,
    },
  });
  const startMongo = () => startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', dbPath, '--nounixsocket',
    '--logpath', join(dbPath, 'mongod.log'), '--logappend',
  ]);

  api = await startApi(apiPort, testDatabase);
  assert.deepEqual(await waitForStatus(origin, '/healthz', 200), { data: { status: 'ok' } });
  assert.equal((await waitForStatus(origin, '/readyz', 503)).code, 'NOT_READY');

  mongo = await startMongo();
  assert.deepEqual(await waitForStatus(origin, '/readyz', 200), { data: { status: 'ready' } });

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 });
  clients.push(client);
  const db = client.db(testDatabase);
  const users = db.collection('users');
  const userIndexes = await users.indexes();
  assert.equal(userIndexes.find((index) => index.name === 'users_email_canonical_unique')?.unique, true);
  const google = userIndexes.find((index) => index.name === 'users_google_sub_unique');
  assert.equal(google?.unique, true);
  assert.deepEqual(google?.partialFilterExpression, { googleSub: { $type: 'string' } });
  const sessionIndexes = await db.collection('authSessions').indexes();
  assert.equal(sessionIndexes.find((index) => index.name === 'auth_sessions_expiry')?.expireAfterSeconds, 0);
  await users.insertMany([
    { emailCanonical: 'first@example.test' },
    { emailCanonical: 'second@example.test' },
    { emailCanonical: 'google@example.test', googleSub: 'example-subject' },
  ]);
  await assert.rejects(users.insertOne({ emailCanonical: 'first@example.test' }), { code: 11000 });
  await assert.rejects(users.insertOne({ emailCanonical: 'other@example.test', googleSub: 'example-subject' }), { code: 11000 });

  await stopProcess(mongo);
  assert.equal((await waitForStatus(origin, '/readyz', 503)).code, 'NOT_READY');
  assert.deepEqual(await waitForStatus(origin, '/healthz', 200), { data: { status: 'ok' } });
  mongo = await startMongo();
  assert.deepEqual(await waitForStatus(origin, '/readyz', 200), { data: { status: 'ready' } });

  assert.deepEqual(await stopProcess(api), [0, null]);
  api = await startApi(apiPort, testDatabase);
  await waitForStatus(origin, '/readyz', 200);
  assert.deepEqual(await users.indexes(), userIndexes);
  assert.deepEqual(await db.collection('authSessions').indexes(), sessionIndexes);

  const badDatabase = 'career_agent_index_conflict';
  const duplicates = client.db(badDatabase).collection('users');
  await duplicates.insertMany([{ emailCanonical: 'duplicate@example.test' }, { emailCanonical: 'duplicate@example.test' }]);
  const conflictPort = await getLoopbackPort();
  conflictingApi = await startApi(conflictPort, badDatabase);
  const conflictOrigin = `http://127.0.0.1:${conflictPort}`;
  assert.equal((await waitForStatus(conflictOrigin, '/readyz', 503)).code, 'NOT_READY');
  assert.equal(await duplicates.countDocuments(), 2);
});

test('partial and invalid MongoDB configuration fail without printing connection details', () => {
  const invalidUri = 'invalid://credential-marker@host';
  const baseEnv = {
    ...process.env, NODE_ENV: 'test', QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '',
    APP_ORIGIN: '', JWT_SIGNING_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
  };
  delete baseEnv.MONGODB_DB;
  const partial = spawnSync(process.execPath, ['dist/server.js'], {
    env: { ...baseEnv, MONGODB_URI: invalidUri }, encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /MONGODB_DB is required/);
  assert.doesNotMatch(partial.stderr, /credential-marker/);

  const malformed = spawnSync(process.execPath, ['dist/server.js'], {
    env: { ...baseEnv, MONGODB_URI: invalidUri, MONGODB_DB: 'career_agent_test' },
    encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /MONGODB_URI must be a valid MongoDB connection string/);
  assert.doesNotMatch(malformed.stderr, /credential-marker/);
});
