import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { MongoClient, ObjectId } from 'mongodb';
import { createBrowser, expectJson } from './support/browser.js';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const databaseName = 'roadmap_integration';
const originPath = '/api/roadmap';
let folder, mongo, api, database, provider, origin, apiEnv;
let respond;
const requests = [];

const draft = {
  background: 'Fictional React developer with two course projects.',
  skills: ['React', 'Git'],
  targetRole: 'Backend developer',
  hoursPerWeek: 6,
  constraints: { budget: 'Free resources' },
};

function validPlan(input) {
  return {
    targetRole: input.targetRole,
    assumptions: ['The learner can spend six hours each week.'],
    phases: [{
      title: 'Backend fundamentals',
      milestones: [
        { title: 'Build a small API', action: 'Implement two endpoints.', rationale: 'Practice HTTP contracts.',
          completionCriterion: 'Both endpoints have request tests.', estimatedHours: 4 },
        { title: 'Deploy the project', action: 'Run the API on a test host.', rationale: 'Practice deployment.',
          completionCriterion: 'The health probe returns HTTP 200.', estimatedHours: 2 },
      ],
    }],
  };
}

async function startApi() {
  api = await startProcess(process.execPath, ['dist/server.js'], { env: apiEnv });
  await waitForStatus(origin, '/readyz', 200);
}

async function waitUntil(read) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await delay(80);
  }
  assert.fail('The expected roadmap state was not reached.');
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'career-agent-roadmap-'));
  const mongoPort = await getLoopbackPort();
  const apiPort = await getLoopbackPort();
  const address = '127.0.0.1:' + mongoPort;
  const uri = 'mongodb://' + address;
  origin = 'http://127.0.0.1:' + apiPort;
  provider = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const context = JSON.parse(body.messages.at(-1).content);
      const recorded = { path: request.url, headers: request.headers, body, context };
      const answer = respond ? respond(context) : validPlan(context);
      requests.push(recorded);
      const plan = await answer;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'stop' }] }));
    } catch {
      response.statusCode = 500;
      response.end();
    }
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');

  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', folder, '--nounixsocket',
    '--replSet', 'careerTest', '--logpath', join(folder, 'mongod.log'),
  ]);
  const bootstrap = new MongoClient(uri + '/?directConnection=true', { serverSelectionTimeoutMS: 10_000 });
  try {
    await bootstrap.db('admin').command({ replSetInitiate: { _id: 'careerTest', members: [{ _id: 0, host: address }] } });
  } finally {
    await bootstrap.close();
  }
  const replicaUri = uri + '/?replicaSet=careerTest';
  database = new MongoClient(replicaUri, { serverSelectionTimeoutMS: 12_000 });
  await database.connect();
  apiEnv = {
    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(apiPort),
    APP_ORIGIN: origin, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    MONGODB_URI: replicaUri, MONGODB_DB: databaseName,
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
    QWEN_API_KEY: 'fixture-key', QWEN_MODEL: 'fixture-qwen', QWEN_ENABLE_THINKING: 'false', QWEN_TIMEOUT_MS: '5000',
    QWEN_BASE_URL: 'http://127.0.0.1:' + provider.address().port + '/compatible-mode/v1',
  };
  await startApi();
});

after(async () => {
  try {
    await Promise.all([stopProcess(api), database?.close()]);
    if (provider?.listening) {
      const closed = once(provider, 'close');
      provider.close();
      provider.closeAllConnections();
      await closed;
    }
  } finally {
    await stopProcess(mongo);
    if (folder) await rm(folder, { recursive: true, force: true });
  }
});

async function openAccount(email, withProfile = true) {
  const browser = createBrowser(origin);
  await expectJson(await browser.request('/api/auth/register', {
    method: 'POST', json: { email, password: 'fictional secure roadmap test password' },
  }), 201);
  if (withProfile) await expectJson(await browser.request('/api/profile', {
    method: 'PUT', json: { ...draft, expectedVersion: 0 },
  }), 201);
  return browser;
}

function generate(browser, key, expectedProfileVersion = 1) {
  return browser.request(originPath + '/generate', {
    method: 'POST', json: { expectedProfileVersion }, headers: key ? { 'Idempotency-Key': key } : {},
  });
}

async function runStatus(browser, id, status) {
  return waitUntil(async () => {
    const { data } = await expectJson(await browser.request('/api/ai/runs/' + id), 200);
    if (data.status === status) return data;
    assert.ok(!['failed', 'succeeded'].includes(data.status), JSON.stringify(data));
    return undefined;
  });
}

async function current(browser) {
  return (await expectJson(await browser.request(originPath), 200)).data;
}

test('initial generation stays private and preserves versioned milestone progress', async () => {
  const browser = await openAccount('roadmap-owner@example.test');
  const other = await openAccount('other-roadmap@example.test', false);
  assert.deepEqual(await current(browser), { roadmap: null, run: null });
  assert.equal((await expectJson(await generate(other, 'requires-profile'), 409)).code, 'PROFILE_REQUIRED');
  assert.equal((await expectJson(await generate(browser, undefined), 400)).code, 'IDEMPOTENCY_KEY_REQUIRED');

  const firstProvider = Promise.withResolvers();
  const priorCalls = requests.length;
  respond = () => firstProvider.promise;
  const { data: queued } = await expectJson(await generate(browser, 'first-generation'), 202);
  await waitUntil(() => requests.length > priorCalls);
  assert.equal((await current(browser)).run.runId, queued.runId);
  assert.equal((await expectJson(await generate(browser, 'first-generation'), 202)).data.runId, queued.runId);
  assert.equal((await expectJson(await generate(browser, 'first-generation', 2), 409)).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await expectJson(await generate(browser, 'second-generation'), 409)).code, 'RUN_IN_PROGRESS');
  assert.equal((await other.request('/api/ai/runs/' + queued.runId)).status, 404);
  assert.equal((await other.request('/api/ai/runs/' + queued.runId + '/retry', { method: 'POST' })).status, 404);

  const request = requests.at(-1);
  assert.equal(request.path, '/compatible-mode/v1/chat/completions');
  assert.equal(request.headers.authorization, 'Bearer fixture-key');
  assert.equal(request.body.model, 'fixture-qwen');
  assert.deepEqual(request.body.response_format, { type: 'json_object' });
  assert.deepEqual(request.context, draft);
  respond = undefined;
  firstProvider.resolve(validPlan(draft));

  const completed = await runStatus(browser, queued.runId, 'succeeded');
  const { roadmap } = await current(browser);
  assert.equal(roadmap.id, completed.result.roadmapId);
  assert.equal(roadmap.version, 1);
  assert.equal(roadmap.profileVersion, 1);
  assert.equal((await expectJson(await generate(browser, 'another-after-complete'), 409)).code, 'ROADMAP_EXISTS');
  const milestone = roadmap.phases[0].milestones[0];
  assert.equal(milestone.status, 'todo');
  assert.equal(roadmap.progress.completedCount, 0);

  const patch = (key, json, target = browser) => target.request(originPath + '/milestones/' + milestone.id, {
    method: 'PATCH', json, headers: { 'Idempotency-Key': key },
  });
  const completion = { status: 'completed', expectedRoadmapVersion: 1, evidenceUrl: 'https://example.test/api' };
  assert.equal((await patch('other-user-write', completion, other)).status, 404);
  assert.equal((await patch('invalid-evidence', { ...completion, evidenceUrl: 'file:///private.txt' })).status, 400);
  const snapshot2 = (await expectJson(await patch('mark-complete', completion), 200)).data.roadmap;
  assert.equal(snapshot2.version, 2);
  assert.equal(snapshot2.progress.completedCount, 1);
  assert.equal(snapshot2.phases[0].milestones[0].evidenceUrl, completion.evidenceUrl);
  assert.ok(snapshot2.phases[0].milestones[0].completedAt);

  const edits = [
    { expectedRoadmapVersion: 2, status: 'todo', evidenceUrl: null },
    { expectedRoadmapVersion: 2, status: 'in_progress', evidenceUrl: null },
  ];
  const racing = await Promise.all(edits.map((input, index) => patch('reopen-' + index, input)));
  assert.deepEqual(racing.map((response) => response.status).sort(), [200, 409]);
  const outcome = (await current(browser)).roadmap;
  assert.equal(outcome.version, 3);
  assert.equal(outcome.progress.completedCount, 0);
  assert.equal(outcome.phases[0].milestones[0].evidenceUrl, null);
  assert.equal(outcome.phases[0].milestones[0].id, milestone.id);
  assert.deepEqual((await expectJson(await patch('mark-complete', completion), 200)).data.roadmap, snapshot2);
  assert.equal((await expectJson(await patch('mark-complete', { ...completion, status: 'todo' }), 409)).code, 'IDEMPOTENCY_CONFLICT');
  const noop = { expectedRoadmapVersion: 3, status: outcome.phases[0].milestones[0].status };
  assert.equal((await expectJson(await patch('same-status', noop), 200)).data.roadmap.version, 3);
  assert.deepEqual((await expectJson(await browser.request(originPath + '/versions/1'), 200)).data.roadmap, roadmap);
  assert.deepEqual((await expectJson(await browser.request(originPath + '/versions/2'), 200)).data.roadmap, snapshot2);
  assert.equal((await other.request(originPath + '/versions/1')).status, 404);
  const page = await expectJson(await browser.request(originPath + '/versions?limit=2'), 200);
  assert.deepEqual(page.data.versions.map((entry) => entry.version), [3, 2]);
  assert.equal(page.nextCursor, '2');
  const rest = await expectJson(await browser.request(originPath + '/versions?cursor=' + page.nextCursor), 200);
  assert.deepEqual(rest.data.versions.map((entry) => entry.version), [1]);
  assert.equal(await database.db(databaseName).collection('progressEvents').countDocuments({ roadmapId: new ObjectId(roadmap.id) }), 2);
});

test('invalid model output can be retried on the same run', async () => {
  const browser = await openAccount('roadmap-retry@example.test');
  const beforeRequests = requests.length;
  respond = () => ({ ...validPlan(draft), targetRole: 'Unsaved role' });
  const { data: queued } = await expectJson(await generate(browser, 'invalid-provider-output'), 202);
  const failed = await runStatus(browser, queued.runId, 'failed');
  assert.equal(failed.error.code, 'AI_INVALID_OUTPUT');
  assert.equal(failed.retryable, true);
  assert.equal(requests.length - beforeRequests, 2);
  assert.equal((await current(browser)).roadmap, null);
  respond = undefined;
  const retried = await expectJson(await browser.request('/api/ai/runs/' + queued.runId + '/retry', { method: 'POST' }), 202);
  assert.equal(retried.data.runId, queued.runId);
  await runStatus(browser, queued.runId, 'succeeded');
  assert.equal((await current(browser)).roadmap.version, 1);
});

test('publication rejects stale profiles and a restarted worker reclaims expired leases', async () => {
  const browser = await openAccount('roadmap-restart@example.test');
  let parked = Promise.withResolvers();
  let count = requests.length;
  respond = () => parked.promise;
  const { data: stale } = await expectJson(await generate(browser, 'stale-profile'), 202);
  await waitUntil(() => requests.length > count);
  const nextProfile = { ...draft, targetRole: 'Platform engineer' };
  await expectJson(await browser.request('/api/profile', { method: 'PUT', json: { ...nextProfile, expectedVersion: 1 } }), 200);
  parked.resolve(validPlan(draft));
  const failed = await runStatus(browser, stale.runId, 'failed');
  assert.equal(failed.error.code, 'PROFILE_VERSION_CONFLICT');
  assert.equal(failed.retryable, false);
  assert.equal((await current(browser)).roadmap, null);

  parked = Promise.withResolvers();
  count = requests.length;
  const { data: interrupted } = await expectJson(await generate(browser, 'interrupted-run', 2), 202);
  await waitUntil(() => requests.length > count);
  const exited = once(api, 'exit');
  api.kill('SIGKILL');
  await exited;
  parked.resolve(validPlan(nextProfile));
  respond = undefined;

  // Advance the abandoned lease in the isolated store instead of waiting for its wall-clock expiry.
  const runs = database.db(databaseName).collection('aiRuns');
  const expired = await runs.updateOne({ _id: new ObjectId(interrupted.runId), status: 'running' }, {
    $set: { availableAt: new Date(Date.now() - 1_000) },
  });
  assert.equal(expired.matchedCount, 1);
  await startApi();
  const recovered = await runStatus(browser, interrupted.runId, 'succeeded');
  assert.equal(recovered.profileVersion, 2);
  assert.equal((await current(browser)).roadmap.targetRole, nextProfile.targetRole);
  assert.equal((await runs.findOne({ _id: new ObjectId(interrupted.runId) })).attempts, 2);
});
