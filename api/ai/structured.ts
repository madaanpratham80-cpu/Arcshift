import type { z } from 'zod';
import { ApiError } from '../http-errors.ts';
import { invalidAiOutput, type AiClient } from './client.ts';

export async function validatedJson<T>(
  ai: AiClient, prompt: string, payload: unknown, schema: z.ZodType<T>,
  isValid: (data: T) => boolean, signal: AbortSignal,
): Promise<T> {
  const content = JSON.stringify(payload);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = schema.safeParse(await ai.completeJson([
        { role: 'system', content: prompt + (attempt ? ' Follow the requested schema and use only supplied references.' : '') },
        { role: 'user', content },
      ], signal));
      if (!result.success || !isValid(result.data)) throw invalidAiOutput();
      return result.data;
    } catch (error) {
      if (attempt || signal.aborted || !(error instanceof ApiError) || error.code !== 'AI_INVALID_OUTPUT') throw error;
    }
  }
  throw invalidAiOutput();
}
