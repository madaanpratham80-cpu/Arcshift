import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { MongoClient, ObjectId } from 'mongodb';
import { createBrowser, expectJson } from './support/browser.js';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const databaseName = 'revision_integration';
const apiPath = '/api/roadmap';
const password = 'synthetic revision fixture password';
const evidence = 'https://example.test/synthetic-evidence';
const background = { background: 'Built course projects.', skills: ['Git', 'React'],
  targetRole: 'Backend developer', hoursPerWeek: 6, constraints: { budget: 'Free resources' } };
const definition = { title: 'Deploy a small test API', action: 'Deploy the API on a test host.',
  rationale: 'Practice deployment.', completionCriterion: 'The readiness probe returns 200.', estimatedHours: 1 };

let folder, mongod, api, provider, client, env, transport;
let propose;
const revisionRequests = [];
let releaseUser;

function initialPlan(context) {
  return {
    targetRole: context.targetRole,
    assumptions: ['Start with a small project.'],
    phases: [{ title: 'Core practice', milestones: [
      { ...definition, title: 'Build a small API', action: 'Implement two endpoints.' },
      { ...definition, title: 'Write API tests', action: 'Add requests and response checks.' },
    ] }],
  };
}

function nextAction(context) {
  return { rationale: 'Add deployment practice to match the new schedule.',
    edits: [{ op: 'add_milestone', phaseId: context.roadmap.phases[0].id, ...definition }] };
}

async function startApi(settings = env, expectedReadyStatus = 200) {
  api = await startProcess(process.execPath, ['dist/server.js'], { env: settings });
  await waitForStatus(transport, '/healthz', 200);
  await waitForStatus(transport, '/readyz', expectedReadyStatus);
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'career-agent-revision-'));
  const mongoPort = await getLoopbackPort();
  const port = await getLoopbackPort();
  const address = '127.0.0.1:' + mongoPort;
  const uri = 'mongodb://' + address;
  transport = 'http://127.0.0.1:' + port;

  provider = createServer(async (request, response) => {
    try {
      const parts = [];
      for await (const part of request) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts).toString());
      const context = JSON.parse(body.messages.at(-1).content);
      let output;
      if ('latestUserMessage' in context) {
        revisionRequests.push(context);
        output = (propose ?? nextAction)(context);
      } else if ('recentSummaries' in context) {
        output = { intent: 'progress', reply: 'Here is a change you can review.',
          affectedMilestoneIds: context.roadmap?.milestones.slice(0, 1).map((item) => item.id) ?? [],
          revisionRequested: true };
      } else if ('previousFacts' in context) {
        output = { facts: [] };
      } else {
        output = initialPlan(context);
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }] }));
    } catch {
      response.statusCode = 503;
      response.end();
    }
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');

  mongod = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', folder, '--nounixsocket',
    '--replSet', 'revisionTest', '--logpath', join(folder, 'mongod.log'),
  ]);
  const bootstrap = new MongoClient(uri + '/?directConnection=true', { serverSelectionTimeoutMS: 10_000 });
  try {
    await bootstrap.db('admin').command({ replSetInitiate: { _id: 'revisionTest', members: [{ _id: 0, host: address }] } });
  } finally {
    await bootstrap.close();
  }
  const replicaUri = uri + '/?replicaSet=revisionTest';
  client = new MongoClient(replicaUri, { serverSelectionTimeoutMS: 12_000 });
  await client.connect();
  env = {
    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
    APP_ORIGIN: transport, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    MONGODB_URI: replicaUri, MONGODB_DB: databaseName,
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
    QWEN_API_KEY: 'fixture-key', QWEN_MODEL: 'fixture-qwen', QWEN_ENABLE_THINKING: 'false', QWEN_TIMEOUT_MS: '6000',
    QWEN_BASE_URL: 'http://127.0.0.1:' + provider.address().port + '/compatible-mode/v1',
  };
  await startApi();
});

after(async () => {
  try {
    await Promise.all([stopProcess(api), client?.close()]);
    if (provider?.listening) {
      const closed = once(provider, 'close');
      provider.close();
      provider.closeAllConnections();
      await closed;
    }
  } finally {
    await stopProcess(mongod);
    if (folder) await rm(folder, { recursive: true, force: true });
  }
});

async function runStatus(browser, id) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { data } = await expectJson(await browser.request('/api/ai/runs/' + id), 200);
    assert.notEqual(data.status, 'failed', JSON.stringify(data));
    if (data.status === 'succeeded') return data;
    await delay(60);
  }
  assert.fail('The expected AI run did not finish.');
}

async function signup(email) {
  const browser = createBrowser(transport);
  await expectJson(await browser.request('/api/auth/register', { method: 'POST', json: { email, password } }), 201);
  return browser;
}

async function profile(browser, expectedVersion, changes = {}) {
  await expectJson(await browser.request('/api/profile', {
    method: 'PUT', json: { ...background, ...changes, expectedVersion },
  }), expectedVersion === 0 ? 201 : 200);
}

async function current(browser) {
  return (await expectJson(await browser.request(apiPath), 200)).data.roadmap;
}

async function setup(email) {
  const browser = await signup(email);
  await profile(browser, 0);
  const { data: run } = await expectJson(await browser.request(apiPath + '/generate', {
    method: 'POST', headers: { 'Idempotency-Key': 'generate' }, json: { expectedProfileVersion: 1 },
  }), 202);
  await runStatus(browser, run.runId);
  const { data: { conversation } } = await expectJson(await browser.request('/api/conversations', {
    method: 'POST', json: { title: 'Revision fixture' },
  }), 201);
  return { browser, conversation, initial: await current(browser) };
}

async function turn(browser, conversation, key, text) {
  const { data: run } = await expectJson(await browser.request('/api/conversations/' + conversation.id + '/messages', {
    method: 'POST', headers: { 'Idempotency-Key': key }, json: { text },
  }), 202);
  return runStatus(browser, run.runId);
}

async function preview(browser, id) {
  return (await expectJson(await browser.request(apiPath + '/proposals/' + id), 200)).data.proposal;
}

function apply(browser, id, options = {}) {
  return browser.request(apiPath + '/proposals/' + id + '/apply', { method: 'POST', ...options });
}

async function progress(browser, milestoneId, key, expectedRoadmapVersion, status, evidenceUrl) {
  return (await expectJson(await browser.request(apiPath + '/milestones/' + milestoneId, {
    method: 'PATCH', headers: { 'Idempotency-Key': key }, json: { expectedRoadmapVersion, status, evidenceUrl },
  }), 200)).data.roadmap;
}

test('a private preview becomes one immutable version only after approval', async () => {
  const email = 'approval-owner@example.test';
  const { browser, conversation, initial } = await setup(email);
  const [first, second] = initial.phases[0].milestones;
  const base = await progress(browser, first.id, 'add-evidence', 1, 'in_progress', evidence);
  const outsider = await signup('approval-outsider@example.test');
  propose = (context) => ({
    rationale: 'Record the completed API and prepare deployment.',
    edits: [
      { op: 'set_status', milestoneId: first.id, status: 'completed', sourceMessageId: context.latestUserMessage.id },
      { op: 'edit_milestone', milestoneId: second.id, changes: { action: 'Add a failing request case.' } },
      { op: 'add_phase', phaseRef: 'deployment', title: 'Deployment' },
      { op: 'add_milestone', phaseId: 'deployment', ...definition },
    ],
  });
  const run = await turn(browser, conversation, 'completed-api', 'I completed "Build a small API". Please revise the roadmap.');
  assert.equal(run.result.proposalAvailability, 'available');
  assert.ok(!JSON.stringify(revisionRequests.at(-1)).includes(evidence));
  assert.deepEqual(await current(browser), base);
  const proposal = await preview(browser, run.result.proposalId);
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.baseProfileVersion, 1);
  assert.equal(proposal.baseRoadmapVersion, 2);
  assert.equal(proposal.sourceMessageId, run.userMessageId);
  assert.deepEqual(proposal.diff.map((change) => change.type),
    ['milestone_status', 'milestone_edited', 'phase_added', 'milestone_added']);
  assert.equal(proposal.diff[0].after.evidenceUrl, evidence);
  assert.equal((await outsider.request(apiPath + '/proposals/' + proposal.id)).status, 404);
  assert.equal((await apply(outsider, proposal.id)).status, 404);
  assert.equal((await apply(browser, proposal.id, { requestOrigin: 'https://other.example.test' })).status, 403);

  const approvals = await Promise.all([apply(browser, proposal.id), apply(browser, proposal.id)]);
  const published = await Promise.all(approvals.map((response) => expectJson(response, 200)));
  const saved = published[0].data.roadmap;
  assert.deepEqual(saved, published[1].data.roadmap);
  assert.equal(saved.version, 3);
  assert.equal(saved.change.proposalId, proposal.id);
  assert.equal(saved.phases[0].milestones[0].status, 'completed');
  assert.equal(saved.phases[0].milestones[0].evidenceUrl, evidence);
  assert.ok(saved.phases[0].milestones[0].completedAt);
  assert.equal(saved.phases[0].milestones[1].id, second.id);
  assert.match(saved.phases[1].milestones[0].id, /^[a-f0-9]{24}$/);
  assert.equal((await preview(browser, proposal.id)).appliedVersion, 3);
  const events = client.db(databaseName).collection('progressEvents');
  assert.equal(await events.countDocuments({ proposalId: new ObjectId(proposal.id) }), 1);

  await profile(browser, 1, { targetRole: 'Platform engineer' });
  propose = () => ({ rationale: 'Prioritize the new saved role.', edits: [
    { op: 'set_target', targetRole: 'Platform engineer' },
    { op: 'retire_milestone', milestoneId: first.id },
  ] });
  const goalRun = await turn(browser, conversation, 'goal-updated', 'Please revise the roadmap for my saved role.');
  const goal = await preview(browser, goalRun.result.proposalId);
  assert.equal(goal.diff.find((change) => change.type === 'milestone_retired').before.evidenceUrl, evidence);
  assert.equal((await current(browser)).targetRole, 'Backend developer');
  const revised = (await expectJson(await apply(browser, goal.id), 200)).data.roadmap;
  assert.equal(revised.version, 4);
  assert.equal(revised.targetRole, 'Platform engineer');
  assert.ok(!revised.phases.flatMap((phase) => phase.milestones).some((item) => item.id === first.id));
  assert.deepEqual((await expectJson(await browser.request(apiPath + '/versions/3'), 200)).data.roadmap, saved);
  assert.deepEqual((await expectJson(await apply(browser, proposal.id), 200)).data.roadmap, saved);
  releaseUser = { email, conversationId: conversation.id, roadmap: revised };
});

test('profile and roadmap changes make proposals stale and competing approvals serialize', async () => {
  const { browser, conversation, initial } = await setup('stale-approval@example.test');
  propose = nextAction;
  const first = await turn(browser, conversation, 'stale-profile', 'Please add deployment practice.');
  await profile(browser, 1, { hoursPerWeek: 8 });
  assert.equal((await preview(browser, first.result.proposalId)).status, 'stale');
  assert.equal((await expectJson(await apply(browser, first.result.proposalId), 409)).code, 'PROPOSAL_STALE');
  assert.deepEqual(await current(browser), initial);

  const second = await turn(browser, conversation, 'stale-plan', 'Please include an additional task.');
  const progressVersion = await progress(browser, initial.phases[0].milestones[0].id, 'manual-change', 1, 'in_progress');
  assert.equal((await expectJson(await apply(browser, second.result.proposalId), 409)).code, 'PROPOSAL_STALE');
  assert.deepEqual(await current(browser), progressVersion);

  const one = await turn(browser, conversation, 'compete-one', 'Add one deployment task.');
  const two = await turn(browser, conversation, 'compete-two', 'Suggest a smaller deployment task.');
  const outcomes = await Promise.all([apply(browser, one.result.proposalId), apply(browser, two.result.proposalId)]);
  assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await current(browser)).version, 3);
});

test('ungrounded edits, completed definitions, and provider failures leave the reply available', async () => {
  const { browser, conversation, initial } = await setup('invalid-approval@example.test');
  const item = initial.phases[0].milestones[0];
  propose = (context) => ({ rationale: 'Mark the item as completed.', edits: [
    { op: 'set_status', milestoneId: item.id, status: 'completed', sourceMessageId: context.latestUserMessage.id },
  ] });
  const ungrounded = await turn(browser, conversation, 'ungrounded', 'I might finish Build a small API later.');
  assert.equal(ungrounded.result.proposalAvailability, 'unavailable');
  assert.equal(ungrounded.result.proposalId, undefined);
  const unrelated = await turn(browser, conversation, 'different-completion', 'I completed the write-up about Build a small API.');
  assert.equal(unrelated.result.proposalAvailability, 'unavailable');
  assert.deepEqual(await current(browser), initial);

  const completed = await progress(browser, item.id, 'complete-manually', 1, 'completed', evidence);
  propose = () => ({ rationale: 'Rewrite the completed item.', edits: [
    { op: 'edit_milestone', milestoneId: item.id, changes: { title: 'Changed title' } },
  ] });
  const protectedResult = await turn(browser, conversation, 'completed-guard', 'Can you change the completed task?');
  assert.equal(protectedResult.result.proposalAvailability, 'unavailable');

  propose = () => ({ rationale: 'Try an unsaved role.', edits: [{ op: 'set_target', targetRole: 'Unsaved role' }] });
  assert.equal((await turn(browser, conversation, 'unsaved-role', 'I want to switch roles.')).result.proposalAvailability, 'unavailable');
  propose = () => { throw new Error('Provider outage'); };
  assert.equal((await turn(browser, conversation, 'provider-outage', 'Please revise the plan.')).result.proposalAvailability, 'unavailable');
  const history = (await expectJson(await browser.request('/api/conversations/' + conversation.id + '/messages'), 200)).data.messages;
  assert.equal(history.length, 10);
  assert.equal(history.at(-1).role, 'assistant');
  assert.deepEqual(await current(browser), completed);
});

test('compiled production startup verifies configuration, readiness, secure cookies, and restart', async () => {
  assert.equal((await stopProcess(api))[0], 0);
  const secureOrigin = 'https://career.example.test';
  const production = { ...env, NODE_ENV: 'production', APP_ORIGIN: secureOrigin,
    QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '' };
  const misconfigured = spawnSync(process.execPath, ['dist/server.js'], {
    env: { ...production, APP_ORIGIN: '', JWT_SIGNING_KEY: '' }, encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(misconfigured.status, 1);
  assert.match(misconfigured.stderr, /Production requires authentication configuration/);

  const standalonePath = join(folder, 'standalone');
  await mkdir(standalonePath);
  const standalonePort = await getLoopbackPort();
  const standalone = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(standalonePort), '--dbpath', standalonePath,
    '--nounixsocket', '--logpath', join(standalonePath, 'mongod.log'),
  ]);
  try {
    const standaloneUri = 'mongodb://127.0.0.1:' + standalonePort;
    const direct = new MongoClient(standaloneUri, { serverSelectionTimeoutMS: 8_000 });
    try { await direct.connect(); } finally { await direct.close(); }
    await startApi({ ...production, MONGODB_URI: standaloneUri }, 503);
    assert.deepEqual(await waitForStatus(transport, '/healthz', 200), { data: { status: 'ok' } });
    assert.equal((await waitForStatus(transport, '/readyz', 503)).code, 'NOT_READY');
    const canUseAccounts = createBrowser(transport, secureOrigin);
    await expectJson(await canUseAccounts.request('/api/auth/register', {
      method: 'POST', json: { email: 'standalone-probe@example.test', password },
    }), 201);
    assert.equal((await stopProcess(api))[0], 0);
  } finally {
    await stopProcess(standalone);
  }

  await startApi(production);
  const response = createBrowser(transport, secureOrigin);
  const login = await response.request('/api/auth/login', {
    method: 'POST', json: { email: releaseUser.email, password },
  });
  await expectJson(login, 200);
  assert.equal(login.headers.get('x-powered-by'), null);
  assert.equal(login.headers.getSetCookie().length, 2);
  assert.ok(login.headers.getSetCookie().every((cookie) => cookie.startsWith('__Host-') && cookie.includes('Secure') && cookie.includes('HttpOnly')));
  assert.deepEqual(await current(response), releaseUser.roadmap);
  assert.equal((await expectJson(await response.request('/api/conversations/' + releaseUser.conversationId), 200)).data.messages.length, 4);
  assert.equal((await stopProcess(api))[0], 0);
  await startApi(production);
  assert.equal((await response.request('/api/auth/session')).status, 200);
  assert.deepEqual(await current(response), releaseUser.roadmap);
});
