import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ObjectId } from 'mongodb';
import type { MongoDatabase } from '../db/mongo.ts';

type WorkSource = (signal: AbortSignal) => Promise<(() => Promise<void>) | undefined>;

export type WorkScheduler = (work: (signal: AbortSignal) => Promise<void>) => void;
type AvailableRun = { _id: ObjectId; active: boolean; availableAt: Date };
export type RunDispatch = (target: (AvailableRun & (
  { kind: 'initial_roadmap' } |
  { kind: 'coach_turn'; userId: ObjectId; conversationId: ObjectId }
)) | { kind: 'session_summary'; userId: ObjectId; conversationId: ObjectId }) => void;

export interface LeasedJob<Kind extends string = string> {
  _id: ObjectId;
  userId: ObjectId;
  kind: Kind;
  leaseToken?: string;
  attempts: number;
  queuedAt: Date;
}

export function claimLease(leaseMs: number, now: Date) {
  return {
    $set: { status: 'running' as const, leaseToken: randomUUID(), updatedAt: now,
      availableAt: new Date(now.getTime() + leaseMs) },
    $inc: { attempts: 1 },
  };
}

export function currentLease<Kind extends string>(run: LeasedJob<Kind>) {
  return {
    _id: run._id, userId: run.userId, kind: run.kind, status: 'running' as const,
    leaseToken: run.leaseToken, availableAt: { $gt: new Date() },
  };
}

export function runExpired(run: LeasedJob) {
  return run.attempts > 3 || Date.now() - run.queuedAt.getTime() > 10 * 60_000;
}

export function startAiWorker(database: MongoDatabase, sources: WorkSource[]) {
  const shutdown = new AbortController();
  const { signal } = shutdown;
  let reportedFailure = false;
  let nextSource = 0;

  async function work() {
    while (!signal.aborted) {
      let worked = false;
      try {
        if (await database.checkReadiness() && !signal.aborted && await database.supportsTransactions()) {
          for (let visits = 0; visits < sources.length && !signal.aborted; visits++) {
            const source = sources[nextSource];
            nextSource = (nextSource + 1) % sources.length;
            const job = await source(signal);
            if (!job) continue;
            await job();
            worked = true;
            break;
          }
        }
        reportedFailure = false;
      } catch {
        if (!reportedFailure && !signal.aborted) console.warn('AI worker could not process pending work.');
        reportedFailure = true;
      }
      if (!worked) await delay(750, undefined, { signal, ref: false }).catch(() => undefined);
    }
  }

  const loop = work();
  return async () => {
    shutdown.abort();
    await loop;
  };
}
