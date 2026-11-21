import express from 'express';
import type { Db } from 'mongodb';
import type { AuthConfig } from '../auth/config.ts';
import { createSessionManager } from '../auth/sessions.ts';
import { isDuplicateKey } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { requireDatabaseReady } from '../request-guards.ts';

const dayMs = 86_400_000;
const day = (value: Date) => value.toISOString().slice(0, 10);
const statuses = ['queued', 'running', 'succeeded', 'failed'] as const;
type Status = typeof statuses[number];

export function createAdminRouter(db: Db, config: AuthConfig, checkReadiness: () => Promise<boolean>) {
  const router = express.Router();
  const sessions = createSessionManager(db, config);
  const owners = db.collection<{ _id: 'owner'; googleSub: string }>('adminOwner');

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  }, requireDatabaseReady(checkReadiness), async (request, _response, next) => {
    const { account, googleEmail } = await sessions.authenticate(request);
    if (!config.adminEmail || googleEmail !== config.adminEmail || !account.googleSub) {
      throw new ApiError(403, 'ADMIN_REQUIRED', 'Sign in with the authorized Google account to open admin.');
    }

    const selector = { _id: 'owner' as const };
    const existing = await owners.findOne(selector);
    const owner = existing ?? await owners.findOneAndUpdate(selector, {
      $setOnInsert: { googleSub: account.googleSub },
    }, { upsert: true, returnDocument: 'after' }).catch(async (error: unknown) => {
      if (!isDuplicateKey(error)) throw error;
      return owners.findOne(selector);
    });
    if (owner?.googleSub !== account.googleSub) {
      throw new ApiError(403, 'ADMIN_REQUIRED', 'Sign in with the authorized Google account to open admin.');
    }
    next();
  });

  router.get('/overview', async (_request, response) => {
    const now = new Date();
    const start = Date.parse(day(now)) - 13 * dayMs;
    const users = db.collection('users');
    const plans = db.collection('roadmaps');

    function dailyCounts(collection: typeof users) {
      return collection.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: new Date(start), $lte: now } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, count: { $sum: 1 } } },
      ]).toArray();
    }

    function jobCounts(name: string, kind: string) {
      return db.collection(name).aggregate<{ _id: Status; count: number }>([
        { $match: { kind, status: { $in: statuses } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).toArray();
    }

    const [accounts, profiles, roadmaps, conversations, signups, generated, generationJobs, coachingJobs] =
      await Promise.all([
        users.countDocuments(), db.collection('careerProfiles').countDocuments(), plans.countDocuments(),
        db.collection('conversations').countDocuments(), dailyCounts(users), dailyCounts(plans),
        jobCounts('aiRuns', 'initial_roadmap'), jobCounts('coachRuns', 'coach_turn'),
      ]);
    const signupDays = new Map(signups.map(({ _id, count }) => [_id, count]));
    const roadmapDays = new Map(generated.map(({ _id, count }) => [_id, count]));
    const activity = Array.from({ length: 14 }, (_, index) => {
      const date = day(new Date(start + index * dayMs));
      return { date, accounts: signupDays.get(date) ?? 0, roadmaps: roadmapDays.get(date) ?? 0 };
    });
    const jobs = { queued: 0, running: 0, succeeded: 0, failed: 0 };
    for (const { _id, count } of [...generationJobs, ...coachingJobs]) jobs[_id] += count;
    response.json({ data: { accounts, profiles, roadmaps, conversations, activity, jobs, updatedAt: now } });
  });

  return router;
}
