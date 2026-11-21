import { ObjectId } from 'mongodb';
import { aiUnavailable, type AiClient } from '../ai/client.ts';
import { claimLease, currentLease, runExpired } from '../ai/worker.ts';
import { isDuplicateKey, type MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { requireTransactionTopology } from '../request-guards.ts';
import { careerProfiles } from '../profile/store.ts';
import { generateRoadmap } from './model.ts';
import { idempotencyConflict, profileVersionConflict, roadmapExists, type RoadmapStore } from './store.ts';

const kind = 'initial_roadmap' as const;

interface RunFailure {
  code: string;
  message: string;
  retryable: boolean;
}

interface RoadmapRun {
  _id: ObjectId;
  userId: ObjectId;
  kind: typeof kind;
  key: string;
  profileVersion: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  active: boolean;
  availableAt: Date;
  queuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  leaseToken?: string;
  failure?: RunFailure;
  result?: { roadmapId: ObjectId; version: number };
}

export function publicRun(run: RoadmapRun | null) {
  if (!run) return null;
  return {
    runId: run._id.toHexString(),
    kind: run.kind,
    status: run.status,
    profileVersion: run.profileVersion,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.failure ? { retryable: run.failure.retryable, error: { code: run.failure.code, message: run.failure.message } } : {}),
    ...(run.result ? { result: { roadmapId: run.result.roadmapId.toHexString(), version: run.result.version } } : {}),
  };
}

function runNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'This generation run is unavailable.');
}

function runInProgress() {
  return new ApiError(409, 'RUN_IN_PROGRESS', 'A roadmap generation run is already in progress.');
}

function runNotRetryable() {
  return new ApiError(409, 'RUN_NOT_RETRYABLE', 'This generation run cannot be retried.');
}

export function createRoadmapRuns(database: MongoDatabase, store: RoadmapStore) {
  const runs = database.db.collection<RoadmapRun>('aiRuns');
  const profiles = careerProfiles(database.db);

  function get(userId: ObjectId, id: ObjectId) {
    return runs.findOne({ _id: id, userId, kind });
  }

  function latest(userId: ObjectId) {
    return runs.findOne({ userId, kind }, { sort: { active: -1, updatedAt: -1, _id: -1 } });
  }

  async function checkSource(userId: ObjectId, profileVersion: number) {
    if (await store.activeFor(userId)) throw roadmapExists();
    const profile = await profiles.findOne({ userId });
    if (!profile) throw new ApiError(409, 'PROFILE_REQUIRED', 'Save your career profile before generating a roadmap.');
    if (profile.version !== profileVersion) throw profileVersionConflict();
    return profile;
  }

  async function enqueue(userId: ObjectId, profileVersion: number, key: string, generationEnabled: boolean) {
    const lookup = { userId, kind, key };
    function replay(previous: RoadmapRun) {
      if (previous.profileVersion !== profileVersion) throw idempotencyConflict();
      return previous;
    }

    const previous = await runs.findOne(lookup);
    if (previous) return replay(previous);
    if (!generationEnabled) throw aiUnavailable();
    await requireTransactionTopology(database);
    await checkSource(userId, profileVersion);
    const now = new Date();
    const run: RoadmapRun = {
      ...lookup, _id: new ObjectId(), profileVersion, status: 'queued', active: true,
      availableAt: now, queuedAt: now, createdAt: now, updatedAt: now, attempts: 0,
    };
    try {
      await runs.insertOne(run);
      return run;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const competing = await runs.findOne(lookup);
      if (competing) return replay(competing);
      throw runInProgress();
    }
  }

  async function retry(userId: ObjectId, id: ObjectId, generationEnabled: boolean) {
    const run = await get(userId, id);
    if (!run) throw runNotFound();
    if (run.active) return run;
    if (run.status !== 'failed' || !run.failure?.retryable) throw runNotRetryable();
    if (!generationEnabled) throw aiUnavailable();
    await requireTransactionTopology(database);
    await checkSource(userId, run.profileVersion);

    try {
      const now = new Date();
      const queued = await runs.findOneAndUpdate(
        { _id: id, userId, kind, status: 'failed', 'failure.retryable': true },
        {
          $set: { status: 'queued', active: true, availableAt: now, queuedAt: now, updatedAt: now, attempts: 0 },
          $unset: { failure: '', leaseToken: '' },
        }, { returnDocument: 'after' },
      );
      if (queued) return queued;
      const current = await get(userId, id);
      if (current?.active) return current;
      throw runNotRetryable();
    } catch (error) {
      if (isDuplicateKey(error)) throw runInProgress();
      throw error;
    }
  }

  function claim(leaseMs: number) {
    const now = new Date();
    return runs.findOneAndUpdate(
      { kind, active: true, availableAt: { $lte: now } },
      claimLease(leaseMs, now), { sort: { availableAt: 1, _id: 1 }, returnDocument: 'after' },
    );
  }

  async function release(run: RoadmapRun) {
    const now = new Date();
    await runs.updateOne(currentLease(run), {
      $set: { status: 'queued', availableAt: now, updatedAt: now },
      $unset: { leaseToken: '' },
    });
  }

  async function processRun(run: RoadmapRun, ai: AiClient, signal: AbortSignal) {
    try {
      if (runExpired(run)) {
        throw new ApiError(503, 'AI_RUN_EXPIRED', 'This generation run timed out. Try again.');
      }
      const profile = await checkSource(run.userId, run.profileVersion);
      const draft = await generateRoadmap(ai, profile, signal);
      if (signal.aborted) {
        await release(run);
        return;
      }

      const roadmapId = new ObjectId();
      await database.transaction(async (session) => {
        const now = new Date();
        const owned = await runs.updateOne(currentLease(run), {
          $set: { status: 'succeeded', active: false, updatedAt: now, result: { roadmapId, version: 1 } },
          $unset: { leaseToken: '' },
        }, { session });
        if (!owned.matchedCount) return;

        // This write serializes publication with edits to the same profile document.
        const guarded = await profiles.updateOne(
          { userId: run.userId, version: run.profileVersion },
          { $inc: { roadmapGuard: 1 } }, { session },
        );
        if (!guarded.matchedCount) throw profileVersionConflict();
        await store.publishInitial(run.userId, run.profileVersion, draft, roadmapId, now, session);
      });
    } catch (error) {
      if (signal.aborted) {
        await release(run);
        return;
      }
      if (!(error instanceof ApiError)) throw error;
      const retryable = ['AI_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'AI_RUN_EXPIRED'].includes(error.code);
      await runs.updateOne(currentLease(run), {
        $set: {
          status: 'failed', active: false, updatedAt: new Date(),
          failure: { code: error.code, message: error.message, retryable },
        },
        $unset: { leaseToken: '' },
      });
    }
  }

  async function claimWork(ai: AiClient, signal: AbortSignal) {
    const run = await claim(ai.leaseMs(2));
    return run ? () => processRun(run, ai, signal) : undefined;
  }

  return { get, latest, enqueue, retry, claimWork };
}

export type RoadmapRuns = ReturnType<typeof createRoadmapRuns>;
