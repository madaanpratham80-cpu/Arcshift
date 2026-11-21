import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AuthConfig } from '../auth/config.ts';
import { createSessionManager, isObjectId } from '../auth/sessions.ts';
import type { MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { assertAppOrigin, requireDatabaseReady, requireIdempotencyKey, requireTransactionTopology } from '../request-guards.ts';
import { milestoneStatus } from './model.ts';
import type { RoadmapProposals } from './proposals.ts';
import { publicRun, type RoadmapRuns } from './runs.ts';
import { publicRoadmap, roadmapNotFound, type RoadmapStore } from './store.ts';

const versionNumber = z.int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const versionParameter = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(versionNumber);
const generationSchema = z.strictObject({ expectedProfileVersion: versionNumber });
const pagingSchema = z.strictObject({
  cursor: versionParameter.optional(),
  limit: versionParameter.pipe(z.int().max(50)).optional(),
});
const evidence = z.string().trim().max(2_048).refine((value) => {
  const url = URL.parse(value);
  return url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}).transform((value) => new URL(value).href).pipe(z.string().max(2_048));
const patchSchema = z.strictObject({
  expectedRoadmapVersion: versionNumber,
  status: milestoneStatus,
  evidenceUrl: evidence.nullable().optional(),
});

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_FAILED', 'Review the roadmap request and try again.');
  return parsed.data;
}

export function createRoadmapRouter(
  database: MongoDatabase,
  auth: AuthConfig,
  store: RoadmapStore,
  runs: RoadmapRuns,
  proposals: RoadmapProposals,
  generationEnabled: boolean,
) {
  const router = express.Router();
  const sessions = createSessionManager(database.db, auth);
  const json = express.json({ limit: '8kb' });

  router.use('/roadmap', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.method === 'POST' || request.method === 'PATCH') assertAppOrigin(request, auth.origin);
    next();
  }, requireDatabaseReady(database.checkReadiness), async (request, response, next) => {
    const { account } = await sessions.authenticate(request);
    response.locals.roadmapOwner = account._id;
    next();
  });

  router.get('/roadmap', async (_request, response) => {
    const owner: ObjectId = response.locals.roadmapOwner;
    const current = await store.activeFor(owner);
    const run = current ? null : await runs.latest(owner);
    response.json({ data: { roadmap: publicRoadmap(current), run: publicRun(run) } });
  });

  router.get('/roadmap/versions', async (request, response) => {
    const query = validate(pagingSchema, request.query);
    const result = await store.listVersions(response.locals.roadmapOwner, query.cursor, query.limit ?? 20);
    response.json({ data: { versions: result.versions }, nextCursor: result.nextCursor });
  });

  router.get('/roadmap/versions/:version', async (request, response) => {
    const number = validate(versionParameter, request.params.version);
    const version = await store.versionFor(response.locals.roadmapOwner, number);
    if (!version) throw roadmapNotFound();
    response.json({ data: { roadmap: publicRoadmap(version) } });
  });

  router.post('/roadmap/generate', json, async (request, response) => {
    const key = requireIdempotencyKey(request);
    const input = validate(generationSchema, request.body);
    const run = await runs.enqueue(response.locals.roadmapOwner, input.expectedProfileVersion, key, generationEnabled);
    response.status(202).json({ data: publicRun(run) });
  });

  router.patch('/roadmap/milestones/:id', json, async (request, response) => {
    const id = request.params.id;
    if (!isObjectId(id)) throw roadmapNotFound();

    const key = requireIdempotencyKey(request);
    const patch = validate(patchSchema, request.body);
    await requireTransactionTopology(database);
    const version = await store.updateMilestone(response.locals.roadmapOwner, id, key, patch);
    response.json({ data: { roadmap: publicRoadmap(version) } });
  });

  router.get('/roadmap/proposals/:id', async (request, response) => {
    if (!isObjectId(request.params.id)) throw roadmapNotFound();
    const proposal = await proposals.get(response.locals.roadmapOwner, new ObjectId(request.params.id));
    response.json({ data: { proposal } });
  });

  router.post('/roadmap/proposals/:id/apply', async (request, response) => {
    if (!isObjectId(request.params.id)) throw roadmapNotFound();
    await requireTransactionTopology(database);
    const version = await proposals.apply(response.locals.roadmapOwner, new ObjectId(request.params.id));
    response.json({ data: { roadmap: publicRoadmap(version) } });
  });

  return router;
}
