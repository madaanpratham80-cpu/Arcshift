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

const basePath = '/api/conversations';
const dbName = 'coaching_integration';
const coachRequests = [];
let folder, mongo, api, database, provider, origin, apiEnv;
let coachOverride, summaryOverride;

function reply(context) {
  return {
    intent: 'advice',
    reply: 'Next step for ' + context.transcript.at(-1).text.trim(),
    affectedMilestoneIds: [],
    revisionRequested: false,
  };
}

function summary(context) {
  const latest = context.transcript.filter((message) => message.role === 'user').at(-1);
  return {
    facts: latest ? [{
      kind: 'goal', text: latest.text.trim().slice(0, 200), sourceMessageIds: [latest.id],
    }] : context.previousFacts,
  };
}

async function startApi(env = apiEnv) {
  api = await startProcess(process.execPath, ['dist/server.js'], { env });
  await waitForStatus(origin, '/readyz', 200);
}

async function waitUntil(read) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await delay(60);
  }
  assert.fail('The expected coaching state was not reached.');
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'career-agent-coaching-'));
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
      let payload;
      if ('recentSummaries' in context) {
        coachRequests.push(context);
        payload = await (coachOverride ?? reply)(context);
      } else if ('previousFacts' in context) {
        payload = await (summaryOverride ?? summary)(context);
      } else {
        throw new Error('Unexpected context shape');
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }] }));
    } catch {
      response.statusCode = 503;
      response.end();
    }
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');

  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--dbpath', folder, '--nounixsocket',
    '--replSet', 'coachTest', '--logpath', join(folder, 'mongod.log'),
  ]);
  const bootstrap = new MongoClient(uri + '/?directConnection=true', { serverSelectionTimeoutMS: 10_000 });
  try {
    await bootstrap.db('admin').command({ replSetInitiate: { _id: 'coachTest', members: [{ _id: 0, host: address }] } });
  } finally {
    await bootstrap.close();
  }
  const replicaUri = uri + '/?replicaSet=coachTest';
  database = new MongoClient(replicaUri, { serverSelectionTimeoutMS: 12_000 });
  await database.connect();
  apiEnv = {
    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(apiPort),
    APP_ORIGIN: origin, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    MONGODB_URI: replicaUri, MONGODB_DB: dbName,
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
    QWEN_API_KEY: 'fixture-key', QWEN_MODEL: 'fixture-qwen', QWEN_ENABLE_THINKING: 'false', QWEN_TIMEOUT_MS: '6000',
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

async function account(email) {
  const browser = createBrowser(origin);
  await expectJson(await browser.request('/api/auth/register', {
    method: 'POST', json: { email, password: 'fictional coaching fixture password' },
  }), 201);
  await expectJson(await browser.request('/api/profile', {
    method: 'PUT',
    json: { expectedVersion: 0, background: 'Built course projects.', skills: ['Git'],
      targetRole: 'Backend developer', hoursPerWeek: 6, constraints: { budget: 'Free resources' } },
  }), 201);
  return browser;
}

async function conversation(browser, title) {
  const result = await expectJson(await browser.request(basePath, { method: 'POST', json: title ? { title } : {} }), 201);
  return result.data.conversation;
}

function send(browser, id, key, text, options = {}) {
  return browser.request(basePath + '/' + id + '/messages', {
    method: 'POST', headers: { 'Idempotency-Key': key }, json: { text }, ...options,
  });
}

async function status(browser, id, expected) {
  return waitUntil(async () => {
    const run = (await expectJson(await browser.request('/api/ai/runs/' + id), 200)).data;
    if (run.status === expected) return run;
    assert.ok(!['succeeded', 'failed'].includes(run.status), JSON.stringify(run));
    return undefined;
  });
}

function retry(browser, id) {
  return browser.request('/api/ai/runs/' + id + '/retry', { method: 'POST' });
}

async function completed(browser, id, key, text) {
  const run = (await expectJson(await send(browser, id, key, text), 202)).data;
  return status(browser, run.runId, 'succeeded');
}

async function history(browser, id, query = '') {
  return expectJson(await browser.request(basePath + '/' + id + '/messages' + query), 200);
}

function waitSummary(id, sequence) {
  return waitUntil(() => database.db(dbName).collection('conversations').findOne({
    _id: new ObjectId(id), 'summary.throughSeq': sequence,
  }));
}

test('coaching sees the newest five completed sessions and preserves exact older messages', async () => {
  const other = await account('other-coach@example.test');
  const otherConversation = await conversation(other, 'Private session');
  await completed(other, otherConversation.id, 'first', 'PRIVATE_OTHER_ACCOUNT');
  await waitSummary(otherConversation.id, 2);
  const browser = await account('memory-coach@example.test');

  const archive = [];
  for (let index = 0; index < 6; index++) {
    const chat = await conversation(browser);
    const text = '  Career goal ' + (index + 1) + '\nKeep original spacing.  ';
    await completed(browser, chat.id, 'first', text);
    await waitSummary(chat.id, 2);
    archive.push({ id: chat.id, text });
  }

  const chat = await conversation(browser);
  const parked = Promise.withResolvers();
  const seen = coachRequests.length;
  coachOverride = () => parked.promise;
  const first = (await expectJson(await send(browser, chat.id, 'new-turn', 'A new cross-session question'), 202)).data;
  await waitUntil(() => coachRequests.length > seen);
  const context = coachRequests.at(-1);
  assert.deepEqual(context.recentSummaries.map((entry) => entry.conversationId), archive.slice(1).reverse().map((entry) => entry.id));
  assert.equal(context.profile.targetRole, 'Backend developer');
  assert.ok(!JSON.stringify(context).includes('PRIVATE_OTHER_ACCOUNT'));
  assert.equal((await history(browser, chat.id)).data.conversation.pendingRunId, first.runId);
  assert.equal((await expectJson(await send(browser, chat.id, 'new-turn', 'A new cross-session question'), 202)).data.runId, first.runId);
  assert.equal((await expectJson(await send(browser, chat.id, 'new-turn', 'Changed text'), 409)).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await expectJson(await send(browser, chat.id, 'parallel', 'Another message'), 409)).code, 'TURN_IN_PROGRESS');
  assert.equal((await other.request(basePath + '/' + chat.id)).status, 404);
  assert.equal((await send(other, chat.id, 'private-request', 'Can I access this?')).status, 404);
  assert.equal((await other.request('/api/ai/runs/' + first.runId)).status, 404);
  assert.equal((await retry(other, first.runId)).status, 404);
  coachOverride = undefined;
  parked.resolve(reply(context));
  await status(browser, first.runId, 'succeeded');
  await waitSummary(chat.id, 2);

  const oldest = archive[0];
  const firstPage = await history(browser, oldest.id, '?limit=1');
  assert.equal(firstPage.data.messages[0].role, 'assistant');
  assert.equal(firstPage.nextCursor, '2');
  const initial = await history(browser, oldest.id, '?limit=1&cursor=' + firstPage.nextCursor);
  assert.equal(initial.data.messages[0].text, oldest.text);
  assert.equal(initial.nextCursor, null);
  assert.equal((await expectJson(await browser.request(basePath + '/' + oldest.id), 200)).data.messages.length, 2);

  const list = await expectJson(await browser.request(basePath + '?limit=3'), 200);
  assert.equal(list.data.conversations[0].id, chat.id);
  assert.equal(list.data.conversations.length, 3);
  const listPage2 = await expectJson(await browser.request(basePath + '?limit=10&cursor=' + list.nextCursor), 200);
  assert.equal(listPage2.data.conversations.length, 4);
  assert.ok(listPage2.data.conversations.some((entry) => entry.id === oldest.id));

  // An unavailable summary must not pull a sixth-oldest completed session into memory.
  await database.db(dbName).collection('conversations').updateOne({ _id: new ObjectId(archive[5].id) }, { $unset: { summary: '' } });
  await completed(browser, oldest.id, 'resume', 'Continue the oldest session');
  const reopened = coachRequests.at(-1);
  assert.equal(reopened.transcript[0].text, oldest.text);
  assert.deepEqual(reopened.recentSummaries.map((entry) => entry.conversationId), [chat.id, archive[4].id, archive[3].id, archive[2].id]);
  await waitSummary(oldest.id, 4);
  await completed(browser, oldest.id, 'resume-again', 'Keep going with this conversation');
  const overlap = coachRequests.at(-1);
  assert.ok(!overlap.recentSummaries.some((entry) => entry.conversationId === oldest.id));
  assert.ok(!overlap.recentSummaries.some((entry) => entry.conversationId === archive[1].id));
  assert.equal((await history(browser, oldest.id)).data.messages.length, 6);
  await waitSummary(oldest.id, 6);
});

test('failed replies and invalid summaries preserve history and enforce retry ordering', async () => {
  const browser = await account('retry-coach@example.test');
  const chat = await conversation(browser, 'Retry conversation');
  coachOverride = (context) => ({ ...reply(context), roadmapPatch: { status: 'completed' } });
  const failedRun = (await expectJson(await send(browser, chat.id, 'failed', '  Exact text to retain.  '), 202)).data;
  const failed = await status(browser, failedRun.runId, 'failed');
  assert.equal(failed.error.code, 'AI_INVALID_OUTPUT');
  assert.equal(failed.retryable, true);
  const saved = await history(browser, chat.id);
  assert.equal(saved.data.messages.length, 1);
  assert.equal(saved.data.messages[0].text, '  Exact text to retain.  ');
  assert.equal(saved.data.conversation.pendingRunId, null);

  coachOverride = undefined;
  summaryOverride = () => ({ facts: [{ kind: 'goal', text: 'Unsupported summary', sourceMessageIds: ['000000000000000000000000'] }] });
  assert.equal((await expectJson(await retry(browser, failedRun.runId), 202)).data.runId, failedRun.runId);
  const succeeded = await status(browser, failedRun.runId, 'succeeded');
  assert.equal(succeeded.userMessageId, failedRun.userMessageId);
  assert.equal((await history(browser, chat.id)).data.messages.length, 2);
  await waitUntil(() => database.db(dbName).collection('coachRuns').findOne({
    conversationId: new ObjectId(chat.id), kind: 'session_summary', status: 'queued', attempts: 1,
  }));
  const stored = await database.db(dbName).collection('conversations').findOne({ _id: new ObjectId(chat.id) });
  assert.equal(stored.summary, undefined);
  assert.equal((await expectJson(await browser.request('/api/roadmap'), 200)).data.roadmap, null);
  summaryOverride = undefined;

  coachOverride = () => { throw new Error('Provider offline'); };
  const obsolete = (await expectJson(await send(browser, chat.id, 'old-failed', 'First follow-up'), 202)).data;
  await status(browser, obsolete.runId, 'failed');
  coachOverride = undefined;
  await completed(browser, chat.id, 'new-follow-up', 'Newer follow-up');
  assert.equal((await expectJson(await retry(browser, obsolete.runId), 409)).code, 'RUN_SUPERSEDED');
  assert.deepEqual((await history(browser, chat.id)).data.messages.map((entry) => entry.seq), [1, 2, 3, 4, 5]);
});

test('a restarted worker resumes a saved message and the archive works with Qwen disabled', async () => {
  const browser = await account('restart-coach@example.test');
  const chat = await conversation(browser);
  const parked = Promise.withResolvers();
  const seen = coachRequests.length;
  coachOverride = () => parked.promise;
  const run = (await expectJson(await send(browser, chat.id, 'restart', 'Resume this exact message.'), 202)).data;
  await waitUntil(() => coachRequests.length > seen);
  const exited = once(api, 'exit');
  api.kill('SIGKILL');
  await exited;
  coachOverride = undefined;
  parked.resolve(reply(coachRequests.at(-1)));

  const runs = database.db(dbName).collection('coachRuns');
  const reclaimed = await runs.updateOne({ _id: new ObjectId(run.runId), status: 'running' }, {
    $set: { availableAt: new Date(Date.now() - 1_000) },
  });
  assert.equal(reclaimed.matchedCount, 1);
  await startApi();
  const result = await status(browser, run.runId, 'succeeded');
  assert.equal(result.userMessageId, run.userMessageId);
  await waitSummary(chat.id, 2);
  const archived = await history(browser, chat.id);
  assert.equal(archived.data.messages.length, 2);

  assert.deepEqual(await stopProcess(api), [0, null]);
  await startApi({ ...apiEnv, QWEN_API_KEY: '', QWEN_BASE_URL: '', QWEN_MODEL: '' });
  assert.deepEqual(await history(browser, chat.id), archived);
  assert.equal((await expectJson(await send(browser, chat.id, 'offline', 'A reply needs Qwen'), 503)).code, 'AI_UNAVAILABLE');
  assert.equal((await history(browser, chat.id)).data.messages.length, 2);
});
