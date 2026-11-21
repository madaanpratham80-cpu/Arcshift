import { z } from 'zod';
import { ApiError } from '../http-errors.ts';

const defaultGroqModel = 'qwen/qwen3.8-27b';
const groqCompletions = 'https://api.groq.com/openai/v1/chat/completions';

interface AiConfig {
  provider: 'qwen' | 'groq';
  endpoint: URL;
  apiKey: string;
  model: string;
  timeoutMs: number;
  enableThinking?: boolean;
}

function readQwenConfig(env: NodeJS.ProcessEnv): AiConfig | undefined {
  const apiKey = env.QWEN_API_KEY?.trim();
  const baseUrl = env.QWEN_BASE_URL?.trim();
  const model = env.QWEN_MODEL?.trim();
  if (!apiKey && !baseUrl && !model) return undefined;
  if (!apiKey || !baseUrl || !model) {
    throw new Error('QWEN_API_KEY, QWEN_BASE_URL, and QWEN_MODEL must be configured together.');
  }

  const endpoint = URL.parse(baseUrl);
  const local = env.NODE_ENV !== 'production' && endpoint?.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  if (!endpoint || (endpoint.protocol !== 'https:' && !local) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      !endpoint.pathname.replace(/\/+$/, '').endsWith('/v1')) {
    throw new Error('QWEN_BASE_URL must be the compatible API base ending in /v1.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/chat/completions';

  const timeoutMs = readTimeout(env.QWEN_TIMEOUT_MS, 'QWEN_TIMEOUT_MS');
  const mode = env.QWEN_ENABLE_THINKING?.trim();
  if (mode && mode !== 'true' && mode !== 'false') {
    throw new Error('QWEN_ENABLE_THINKING must be true or false.');
  }
  return { provider: 'qwen', endpoint, apiKey, model, timeoutMs, enableThinking: mode ? mode === 'true' : undefined };
}

function readTimeout(value: string | undefined, name: string): number {
  const timeout = Number(value ?? '20000');
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
    throw new Error(name + ' must be an integer from 1000 to 60000.');
  }
  return timeout;
}

export function readAiConfig(env: NodeJS.ProcessEnv): AiConfig | undefined {
  const provider = env.AI_PROVIDER?.trim();
  if (provider && provider !== 'qwen' && provider !== 'groq') {
    throw new Error('AI_PROVIDER must be qwen or groq.');
  }
  const groqKey = env.GROQ_API_KEY?.trim();
  const groqModel = env.GROQ_MODEL?.trim();
  const wantsGroq = !!(groqKey || groqModel);
  const wantsQwen = [env.QWEN_API_KEY, env.QWEN_BASE_URL, env.QWEN_MODEL].some((value) => !!value?.trim());
  if (!provider && wantsGroq && wantsQwen) {
    throw new Error('Set AI_PROVIDER when both Groq and Alibaba Model Studio settings are present.');
  }
  if (provider === 'groq' || (!provider && wantsGroq)) {
    if (!groqKey) throw new Error('GROQ_API_KEY is required for Groq.');
    return {
      provider: 'groq', endpoint: new URL(groqCompletions), apiKey: groqKey,
      model: groqModel || defaultGroqModel, timeoutMs: readTimeout(env.GROQ_TIMEOUT_MS, 'GROQ_TIMEOUT_MS'),
    };
  }
  const qwen = readQwenConfig(env);
  if (provider === 'qwen' && !qwen) throw new Error('Set the Alibaba Model Studio settings for the qwen provider.');
  return qwen;
}

interface Message {
  role: 'system' | 'user';
  content: string;
}

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().max(48_000) }),
    finish_reason: z.string().optional(),
  })).min(1),
});

export function aiUnavailable() {
  return new ApiError(503, 'AI_UNAVAILABLE', 'Roadmap generation is temporarily unavailable.');
}

export function invalidAiOutput() {
  return new ApiError(502, 'AI_INVALID_OUTPUT', 'The generated roadmap could not be validated.');
}

const errorSchema = z.object({ error: z.object({ code: z.string() }) });

export function createAiClient(config: AiConfig, request = fetch) {
  const completionOptions = config.provider === 'groq'
    ? { max_completion_tokens: 4_096 }
    : { max_tokens: 4_096, ...(config.enableThinking === undefined ? {} : { enable_thinking: config.enableThinking }) };

  async function completeJson(messages: Message[], signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await request(config.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]),
        headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: 'json_object' },
          ...completionOptions,
        }),
      });
    } catch {
      throw aiUnavailable();
    }
    if (!response.ok) {
      if (config.provider === 'groq' && response.status === 400) {
        const error = errorSchema.safeParse(await response.json().catch(() => undefined));
        if (error.success && error.data.error.code === 'json_validate_failed') throw invalidAiOutput();
      } else {
        await response.body?.cancel().catch(() => undefined);
      }
      throw aiUnavailable();
    }

    const body: unknown = await response.json().catch(() => undefined);
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success || parsed.data.choices[0].finish_reason === 'length') throw invalidAiOutput();
    try {
      return JSON.parse(parsed.data.choices[0].message.content);
    } catch {
      throw invalidAiOutput();
    }
  }

  return { completeJson, leaseMs: (maxCalls: number) => config.timeoutMs * maxCalls + 30_000 };
}

export type AiClient = ReturnType<typeof createAiClient>;
