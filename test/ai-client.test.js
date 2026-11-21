import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, readAiConfig } from '../dist/ai/client.js';

const groq = { GROQ_API_KEY: 'synthetic-groq-key' };
const qwen = { QWEN_API_KEY: 'synthetic-qwen-key', QWEN_BASE_URL: 'https://example.test/v1', QWEN_MODEL: 'fixture-qwen' };
const messages = [{ role: 'user', content: 'Return a JSON object.' }];

test('model provider selection preserves the legacy settings and requires a choice when both are configured', () => {
  assert.equal(readAiConfig({}), undefined);
  assert.equal(readAiConfig(qwen).provider, 'qwen');
  assert.equal(readAiConfig(groq).provider, 'groq');
  assert.throws(() => readAiConfig({ ...groq, ...qwen }), /AI_PROVIDER/);
  assert.equal(readAiConfig({ ...groq, ...qwen, AI_PROVIDER: 'groq' }).provider, 'groq');
  assert.equal(readAiConfig({ ...groq, ...qwen, AI_PROVIDER: 'qwen' }).provider, 'qwen');
  assert.throws(() => readAiConfig({ AI_PROVIDER: 'groq' }), /GROQ_API_KEY/);
});

test('Groq uses its fixed HTTPS endpoint and its JSON completion parameters', async () => {
  const config = readAiConfig({ ...groq, GROQ_MODEL: 'synthetic-model', QWEN_ENABLE_THINKING: 'false' });
  const client = createAiClient(config, async (url, init) => {
    assert.equal(url.href, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-groq-key');
    assert.deepEqual(JSON.parse(init.body), {
      model: 'synthetic-model', messages, response_format: { type: 'json_object' }, max_completion_tokens: 4096,
    });
    return Response.json({ choices: [{ message: { content: '{"ready":true}' }, finish_reason: 'stop' }] });
  });
  assert.deepEqual(await client.completeJson(messages, new AbortController().signal), { ready: true });
});

test('invalid Groq JSON is eligible for the existing output retry path', async () => {
  const client = createAiClient(readAiConfig(groq), async () =>
    Response.json({ error: { code: 'json_validate_failed', failed_generation: 'private generated content' } }, { status: 400 }));
  await assert.rejects(client.completeJson(messages, new AbortController().signal), { code: 'AI_INVALID_OUTPUT' });
});
