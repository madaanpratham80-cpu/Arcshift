import type { RunDispatch } from '../ai/worker.ts';
import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AuthConfig } from '../auth/config.ts';
import { createSessionManager, isObjectId } from '../auth/sessions.ts';
import type { MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { assertAppOrigin, requireDatabaseReady, requireIdempotencyKey } from '../request-guards.ts';
import { conversationNotFound, publicCoachRun, type CoachingRuns } from './runs.ts';
import { publicConversation, type ConversationStore } from './store.ts';

const positive = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.int().positive());
const pageSize = positive.pipe(z.int().max(50));
const listSchema = z.strictObject({ cursor: z.string().max(200).optional(), limit: pageSize.optional() });
const historySchema = z.strictObject({ cursor: positive.optional(), limit: pageSize.optional() });
const titleSchema = z.strictObject({
  title: z.string().trim().min(1).max(120).refine((value) => value.isWellFormed()).optional(),
});
const messageSchema = z.strictObject({
  text: z.string().max(4_000).refine((value) => value.isWellFormed() && value.trim().length > 0),
});

function invalidConversationInput() {
  return new ApiError(400, 'VALIDATION_FAILED', 'Review the conversation request and try again.');
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidConversationInput();
  return parsed.data;
}

function listCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidConversationInput();
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const [time, id] = z.tuple([z.iso.datetime(), z.string().refine(isObjectId)]).parse(decoded);
    return { updatedAt: new Date(time), id: new ObjectId(id) };
  } catch {
    throw invalidConversationInput();
  }
}

export function createConversationRouter(
  database: MongoDatabase, auth: AuthConfig, store: ConversationStore, runs: CoachingRuns, generationEnabled: boolean,
  dispatch?: RunDispatch,
) {
  const router = express.Router();
  const sessions = createSessionManager(database.db, auth);
  const json = express.json({ limit: '32kb' });

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.method === 'POST') assertAppOrigin(request, auth.origin);
    next();
  }, requireDatabaseReady(database.checkReadiness), async (request, response, next) => {
    const { account } = await sessions.authenticate(request);
    response.locals.conversationOwner = account._id;
    next();
  });

  router.post('/', json, async (request, response) => {
    const { title } = parse(titleSchema, request.body ?? {});
    const conversation = await store.create(response.locals.conversationOwner, title);
    response.status(201).json({ data: { conversation: publicConversation(conversation) } });
  });

  router.get('/', async (request, response) => {
    const query = parse(listSchema, request.query);
    const page = await store.list(response.locals.conversationOwner, listCursor(query.cursor), query.limit ?? 20);
    response.json({ data: { conversations: page.conversations }, nextCursor: page.nextCursor });
  });

  router.get(['/:id', '/:id/messages'], async (request, response) => {
    if (!isObjectId(request.params.id)) throw conversationNotFound();
    const query = parse(historySchema, request.query);
    const userId: ObjectId = response.locals.conversationOwner;
    const conversationId = new ObjectId(request.params.id);
    const result = await store.history(userId, conversationId, query.cursor, query.limit ?? 30);
    if (!result) throw conversationNotFound();
    dispatch?.({ kind: 'session_summary', userId, conversationId });
    response.json({ data: { conversation: result.conversation, messages: result.messages }, nextCursor: result.nextCursor });
  });

  router.post('/:id/messages', json, async (request, response) => {
    if (!isObjectId(request.params.id)) throw conversationNotFound();
    const key = requireIdempotencyKey(request);
    const { text } = parse(messageSchema, request.body);
    const run = await runs.send(
      response.locals.conversationOwner, new ObjectId(request.params.id), key, text, generationEnabled,
    );
    dispatch?.(run);
    response.status(202).json({ data: publicCoachRun(run) });
  });

  return router;
}
