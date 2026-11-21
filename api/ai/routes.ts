import express from 'express';
import { ObjectId } from 'mongodb';
import type { AuthConfig } from '../auth/config.ts';
import { createSessionManager, isObjectId } from '../auth/sessions.ts';
import { publicCoachRun, type CoachingRuns } from '../coaching/runs.ts';
import type { MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { assertAppOrigin, requireDatabaseReady } from '../request-guards.ts';
import { publicRun, type RoadmapRuns } from '../roadmap/runs.ts';

function runNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'This AI run is unavailable.');
}

export function createAiRunRouter(
  database: MongoDatabase, auth: AuthConfig, roadmaps: RoadmapRuns, coaching: CoachingRuns, generationEnabled: boolean,
) {
  const router = express.Router();
  const sessions = createSessionManager(database.db, auth);

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (request.method === 'POST') assertAppOrigin(request, auth.origin);
    next();
  }, requireDatabaseReady(database.checkReadiness), async (request, response, next) => {
    const { account } = await sessions.authenticate(request);
    response.locals.runOwner = account._id;
    next();
  });

  router.get('/:id', async (request, response) => {
    if (!isObjectId(request.params.id)) throw runNotFound();
    const owner: ObjectId = response.locals.runOwner;
    const id = new ObjectId(request.params.id);
    const roadmap = await roadmaps.get(owner, id);
    if (roadmap) {
      response.json({ data: publicRun(roadmap) });
      return;
    }
    const coach = await coaching.get(owner, id);
    if (!coach) throw runNotFound();
    response.json({ data: publicCoachRun(coach) });
  });

  router.post('/:id/retry', async (request, response) => {
    if (!isObjectId(request.params.id)) throw runNotFound();
    const owner: ObjectId = response.locals.runOwner;
    const id = new ObjectId(request.params.id);
    if (await roadmaps.get(owner, id)) {
      response.status(202).json({ data: publicRun(await roadmaps.retry(owner, id, generationEnabled)) });
      return;
    }
    response.status(202).json({ data: publicCoachRun(await coaching.retry(owner, id, generationEnabled)) });
  });

  return router;
}
