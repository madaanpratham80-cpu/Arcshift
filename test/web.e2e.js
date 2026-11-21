import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MongoClient } from 'mongodb';
import { chromium } from 'playwright';
import { getLoopbackPort, startProcess, stopProcess, waitForStatus } from './support/processes.js';

const vercel = process.env.ARCSHIFT_TEST_VERCEL === '1';
const email = 'career-workspace@example.test';
const password = 'synthetic browser test password';
const coachMessage = 'Can we add deployment practice?\nI can study on weekends.';
const coachReply = 'I suggest adding a small deployment exercise for the weekends.';
const milestone = {
  title: 'Deploy a small API',
  action: 'Deploy a sample API to a test host.',
  rationale: 'Practice deployment.',
  completionCriterion: 'The readiness probe returns HTTP 200.',
  estimatedHours: 2,
};

test('browser journey from signup through an approved revision and session restoration', { timeout: 90_000 }, async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'career-agent-web-'));
  const holdFirstReply = Promise.withResolvers();
  let provider, mongo, api, browser;
  let coachingTurns = 0;
  t.after(async () => {
    holdFirstReply.resolve();
    try {
      await browser?.close();
      await stopProcess(api);
      if (provider?.listening) {
        const closed = once(provider, 'close');
        provider.close();
        provider.closeAllConnections();
        await closed;
      }
    } finally {
      await stopProcess(mongo);
      await rm(folder, { recursive: true, force: true });
    }
  });

  provider = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const context = JSON.parse(payload.messages.at(-1).content);
      let output;
      if ('latestUserMessage' in context) {
        output = { rationale: 'Add a short deployment exercise that fits your available time.',
          edits: [{ op: 'add_milestone', phaseId: context.roadmap.phases[0].id, ...milestone }] };
      } else if ('recentSummaries' in context) {
        if (++coachingTurns === 1) {
          await holdFirstReply.promise;
          output = { intent: 'progress', reply: coachReply, affectedMilestoneIds: [], revisionRequested: true };
        } else {
          output = { intent: 'progress', reply: 'Start with one readiness endpoint.', affectedMilestoneIds: [], revisionRequested: false };
        }
      } else if ('previousFacts' in context) {
        output = { facts: [] };
      } else {
        output = { targetRole: context.targetRole, assumptions: ['Use a small project.'], phases: [{
          title: 'Build the foundations',
          milestones: [{ ...milestone, title: 'Build a small API', action: 'Implement two endpoints.', rationale: 'Practice HTTP routes.' },
            { ...milestone, title: 'Write API tests', action: 'Add requests and response checks.', rationale: 'Verify the route contracts.' }],
        }] };
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }] }));
    } catch {
      response.statusCode = 503;
      response.end();
    }
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');

  const address = '127.0.0.1:' + await getLoopbackPort();
  const uri = 'mongodb://' + address;
  const port = await getLoopbackPort();
  const origin = 'http://127.0.0.1:' + port;
  mongo = await startProcess(process.env.MONGOD_BIN || 'mongod', [
    '--bind_ip', '127.0.0.1', '--port', address.split(':')[1], '--dbpath', folder, '--nounixsocket',
    '--replSet', 'webTest', '--logpath', join(folder, 'mongod.log'),
  ]);
  const bootstrap = new MongoClient(uri + '/?directConnection=true', { serverSelectionTimeoutMS: 10_000 });
  try {
    await bootstrap.db('admin').command({ replSetInitiate: { _id: 'webTest', members: [{ _id: 0, host: address }] } });
  } finally {
    await bootstrap.close();
  }

  const entry = vercel ? 'test/support/vercel-server.js' : 'dist/server.js';
  api = await startProcess(process.execPath, [entry], { env: {
    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
    APP_ORIGIN: origin, JWT_SIGNING_KEY: randomBytes(32).toString('base64url'),
    MONGODB_URI: uri + '/?replicaSet=webTest', MONGODB_DB: 'web_end_to_end',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '', TRUST_PROXY_HOPS: '',
    QWEN_API_KEY: 'fixture-key', QWEN_MODEL: 'fixture-qwen', QWEN_ENABLE_THINKING: 'false', QWEN_TIMEOUT_MS: '20000',
    QWEN_BASE_URL: 'http://127.0.0.1:' + provider.address().port + '/compatible-mode/v1',
  } });
  await waitForStatus(origin, '/readyz', 200);

  browser = await chromium.launch(process.env.CAREER_BROWSER_CHANNEL ? { channel: process.env.CAREER_BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 940 } });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const link = (name) => page.getByRole('link', { name, exact: true });
  async function capture(name) {
    const directory = process.env.CAREER_SCREENSHOTS;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, name + '.png'), fullPage: true, animations: 'disabled' });
  }

  const missing = await context.request.get(origin + '/api/unknown');
  assert.equal(missing.status(), 404);
  assert.equal((await missing.json()).code, 'NOT_FOUND');
  const missingAsset = await context.request.get(origin + '/assets/missing.js');
  assert.equal(missingAsset.status(), 404);

  await page.goto(origin);
  await heading('Build a plan for your next role.').waitFor();
  await capture('landing');
  await link('Create your roadmap').click();
  await button('Continue with Google').click();
  await page.getByText('Google sign-in is temporarily unavailable.', { exact: true }).waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await button('Create account').click();
  await heading('Set up your career profile').waitFor();
  await page.getByLabel('Current background').fill('I built two React projects and want to work on APIs.');
  await page.getByLabel('Skills', { exact: true }).fill('Research, synthesis');
  await button('Add skill').click();
  await page.getByLabel('Skills', { exact: true }).fill('Git');
  await page.getByLabel('Target role').fill('Backend developer');
  await page.getByLabel('Hours available each week').fill('6');
  await page.getByLabel(/^Budget/).fill('Free resources');
  await button('Save and continue').click();
  await heading('Your roadmap').waitFor();

  await button('Generate roadmap').click();
  await heading('Build a small API').waitFor();
  await button('Update progress for Build a small API').click();
  await page.getByLabel('Status', { exact: true }).selectOption('completed');
  await page.getByLabel(/^Evidence link/).fill('https://example.test/synthetic-evidence');
  await button('Save progress').click();
  await page.getByText('1 of 2 milestones complete', { exact: true }).waitFor();
  await heading('Your career journey').waitFor();
  const heatmap = page.getByRole('group', { name: /Daily activity calendar/ });
  await heatmap.waitFor();
  assert.equal(await heatmap.getByRole('button').count(), 365);
  if (process.env.CAREER_SCREENSHOTS) {
    await mkdir(process.env.CAREER_SCREENSHOTS, { recursive: true });
    await page.getByRole('region', { name: 'Your career journey' }).screenshot({
      path: join(process.env.CAREER_SCREENSHOTS, 'career-activity.png'),
      animations: 'disabled',
      style: '.member-header { position: static !important; }',
    });
  }
  await heatmap.locator('[aria-current="date"]').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await heatmap.locator('[data-day-index="357"]').getAttribute('aria-pressed'), 'true');
  const activityUrl = origin + '/api/activity?timeZone=Asia%2FKolkata';
  const activity = await context.request.get(activityUrl);
  assert.equal(activity.status(), 200);
  const { data: calendar } = await activity.json();
  assert.equal(calendar.days.reduce((sum, item) => sum + item.count, 0), 3);
  assert.equal((await context.request.get(origin + '/api/activity?timeZone=bad')).status(), 400);
  const separate = await browser.newContext();
  try {
    assert.equal((await separate.request.get(activityUrl)).status(), 401);
    assert.equal((await separate.request.post(origin + '/api/auth/register', {
      headers: { Origin: origin },
      data: { email: 'separate-activity@example.test', password: 'synthetic isolated test password' },
    })).status(), 201);
    const outsider = await separate.request.get(activityUrl);
    assert.equal(outsider.status(), 200);
    assert.equal((await outsider.json()).data.activeDays, 0);
  } finally {
    await separate.close();
  }
  assert.equal(await link('View evidence').getAttribute('href'), 'https://example.test/synthetic-evidence');
  await capture('roadmap');

  await link('AI Coach').click();
  await button('New conversation').click();
  const messageBox = page.getByRole('textbox', { name: 'Message your coach' });
  await messageBox.fill(coachMessage);
  const queued = page.waitForResponse((response) => response.url().includes('/messages') && response.status() === 202);
  await button('Send').click();
  await queued;
  await page.reload();
  await page.getByText('Your coach is preparing a reply…', { exact: true }).waitFor();
  holdFirstReply.resolve();
  await page.getByText(coachReply, { exact: true }).waitFor();
  await link('Review proposed change').click();
  await heading('Review roadmap changes').waitFor();
  await heading('Milestone added').waitFor();
  await page.getByText('Based on roadmap version 2.', { exact: true }).waitFor();
  await capture('proposal');
  await button('Apply changes').click();
  await page.getByText('Changes applied to version 3.', { exact: true }).waitFor();
  const afterApproval = await context.request.get(activityUrl);
  const { data: updatedActivity } = await afterApproval.json();
  assert.equal(updatedActivity.days.reduce((sum, item) => sum + item.count, 0), 5);
  const activityDb = new MongoClient(uri + '/?replicaSet=webTest', { serverSelectionTimeoutMS: 3_000 });
  try {
    const db = activityDb.db('web_end_to_end');
    const account = await db.collection('users').findOne({ emailCanonical: email });
    const stored = await db.collection('activityStreaks').findOne({ _id: account._id });
    for (const key of ['activeDays', 'currentStreak', 'longestStreak', 'timeZone']) {
      assert.equal(stored.snapshot[key], updatedActivity[key]);
    }
    assert.equal(stored.snapshot.throughDate, updatedActivity.days.at(-1).date);
    assert.ok(stored.snapshot.computedAt instanceof Date);
    assert.equal(await db.collection('activityStreaks').countDocuments(), 2);
  } finally {
    await activityDb.close();
  }
  await link('View current roadmap').click();
  await heading('Deploy a small API').waitFor();
  await link('Version history').click();
  await page.getByRole('link', { name: /^Version 1 Initial roadmap/ }).click();
  await heading('Roadmap version 1').waitFor();
  await page.getByText('0 of 2 milestones complete', { exact: true }).waitFor();
  assert.equal(await heading('Deploy a small API').count(), 0);

  await link('History').click();
  await page.locator('.record-list a').first().click();
  assert.equal(await page.locator('.message.user p').textContent(), coachMessage);
  await messageBox.fill('What should I do first?');
  await button('Send').click();
  await page.getByText('Start with one readiness endpoint.', { exact: true }).waitFor();
  await capture('coach');
  await page.reload();
  await link('Review proposed change').click();
  await page.getByText('Changes applied to version 3.', { exact: true }).waitFor();

  await context.clearCookies({ name: 'career_access' });
  await page.reload();
  await heading('Review roadmap changes').waitFor();
  assert.ok((await context.cookies()).some((cookie) => cookie.name === 'career_access' && cookie.httpOnly));

  await page.setViewportSize({ width: 390, height: 844 });
  await link('Roadmap').click();
  await heading('Your roadmap').waitFor();
  await heading('Deploy a small API').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await capture('roadmap-mobile');

  await link('Settings').click();
  await button('Remove Research, synthesis').waitFor();
  await button('Remove Git').waitFor();
  await page.getByLabel('Hours available each week').fill('8.5');
  await button('Save profile').click();
  await page.getByText('Career profile saved.', { exact: true }).waitFor();
  await page.reload();
  assert.equal(await page.getByLabel('Hours available each week').inputValue(), '8.5');
  const settings = page.url();
  await button('Sign out').click();
  await heading('Sign in').waitFor();
  await page.goto(settings);
  await heading('Sign in').waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await button('Sign in').click();
  await heading('Settings').waitFor();
  assert.deepEqual(browserErrors, []);
});
