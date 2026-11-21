import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { AiClient } from '../ai/client.ts';
import { claimLease, currentLease, runExpired, type LeasedJob } from '../ai/worker.ts';
import { isDuplicateKey, type MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { careerProfiles } from '../profile/store.ts';
import { requireTransactionTopology } from '../request-guards.ts';
import type { RoadmapProposals } from '../roadmap/proposals.ts';
import { prepareRoadmapRevision, type PreparedRevision } from '../roadmap/revision.ts';
import type { RoadmapStore } from '../roadmap/store.ts';
import { summarizeConversation, writeCoachReply } from './model.ts';
import type { ConversationStore, SessionSummary } from './store.ts';

const coachKind = 'coach_turn' as const;
const summaryKind = 'session_summary' as const;
type JobKind = typeof coachKind | typeof summaryKind;

interface CoachingWork extends LeasedJob {
  kind: JobKind;
  conversationId: ObjectId;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  active: boolean;
  availableAt: Date;
  createdAt: Date;
  updatedAt: Date;
  failure?: { code: string; message: string; retryable: boolean };
}

export interface CoachResult {
  assistantMessageId: ObjectId;
  intent: string;
  affectedMilestoneIds: string[];
  revisionRequested: boolean;
  proposalAvailability?: 'not_requested' | 'available' | 'unavailable';
  proposalId?: ObjectId;
}

export function publicProposalHint(result: CoachResult) {
  return {
    proposalAvailability: result.proposalAvailability ?? (result.revisionRequested ? 'unavailable' : 'not_requested'),
    ...(result.proposalId ? { proposalId: result.proposalId.toHexString() } : {}),
  };
}

export interface CoachRun extends CoachingWork {
  kind: typeof coachKind;
  key: string;
  fingerprint: string;
  userMessageId: ObjectId;
  inputSeq: number;
  result?: CoachResult;
}

interface SummaryRun extends CoachingWork {
  kind: typeof summaryKind;
}

function unavailable() {
  return new ApiError(503, 'AI_UNAVAILABLE', 'The coach is temporarily unavailable.');
}

export function conversationNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'This conversation or run is unavailable.');
}

function turnInProgress() {
  return new ApiError(409, 'TURN_IN_PROGRESS', 'A reply is already in progress for this conversation.');
}

function superseded() {
  return new ApiError(409, 'RUN_SUPERSEDED', 'Send a follow-up to continue from the latest conversation state.');
}

export function publicCoachRun(run: CoachRun) {
  return {
    runId: run._id.toHexString(), kind: run.kind, status: run.status,
    conversationId: run.conversationId.toHexString(), userMessageId: run.userMessageId.toHexString(),
    createdAt: run.createdAt, updatedAt: run.updatedAt,
    ...(run.result ? { result: {
      assistantMessageId: run.result.assistantMessageId.toHexString(),
      ...publicProposalHint(run.result),
    } } : {}),
    ...(run.failure ? { retryable: run.failure.retryable, error: { code: run.failure.code, message: run.failure.message } } : {}),
  };
}

function queueState(now: Date) {
  return { status: 'queued' as const, active: true, availableAt: now, queuedAt: now, updatedAt: now, attempts: 0 };
}

export function createCoachingRuns(
  database: MongoDatabase, store: ConversationStore, roadmaps: RoadmapStore, proposals: RoadmapProposals,
) {
  const runs = database.db.collection<CoachRun | SummaryRun>('coachRuns');
  const profiles = careerProfiles(database.db);
  const { conversations, messages } = store;

  async function get(userId: ObjectId, id: ObjectId) {
    const found = await runs.findOne({ _id: id, userId, kind: coachKind });
    return found?.kind === coachKind ? found : null;
  }

  async function send(userId: ObjectId, conversationId: ObjectId, key: string, text: string, generationEnabled: boolean) {
    const keyFilter = { userId, conversationId, kind: coachKind, key };
    const fingerprint = createHash('sha256').update(text).digest('hex');
    function replay(previous: CoachRun | SummaryRun) {
      if (previous.kind !== coachKind || previous.fingerprint !== fingerprint) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used with different input.');
      }
      return previous;
    }

    const previous = await runs.findOne(keyFilter);
    if (previous) return replay(previous);
    if (!await conversations.findOne({ _id: conversationId, userId }, { projection: { _id: 1 } })) {
      throw conversationNotFound();
    }
    if (!generationEnabled) throw unavailable();
    await requireTransactionTopology(database);

    try {
      return await database.transaction(async (session) => {
        const existing = await runs.findOne(keyFilter, { session });
        if (existing) return replay(existing);
        const conversation = await conversations.findOne({ _id: conversationId, userId }, { session });
        if (!conversation) throw conversationNotFound();
        if (conversation.pendingRunId) throw turnInProgress();
        if (!await profiles.findOne({ userId }, { session, projection: { _id: 1 } })) {
          throw new ApiError(409, 'PROFILE_REQUIRED', 'Save your career profile before using the coach.');
        }

        const now = new Date();
        const id = new ObjectId();
        const userMessageId = new ObjectId();
        const inputSeq = conversation.lastSeq + 1;
        const title = conversation.lastSeq === 0 && conversation.autoTitle
          ? Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, 72).join('')
          : conversation.title;
        await conversations.updateOne({ _id: conversationId, userId }, {
          $set: { lastSeq: inputSeq, lastRunId: id, pendingRunId: id, updatedAt: now, title },
        }, { session });
        const run: CoachRun = {
          ...keyFilter, ...queueState(now), _id: id, createdAt: now, fingerprint, userMessageId, inputSeq,
        };
        await messages.insertOne({
          _id: userMessageId, userId, conversationId, seq: inputSeq, role: 'user', text, runId: id, createdAt: now,
        }, { session });
        await runs.insertOne(run, { session });
        return run;
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const existing = await runs.findOne(keyFilter);
        if (existing) return replay(existing);
      }
      throw error;
    }
  }

  async function retry(userId: ObjectId, id: ObjectId, generationEnabled: boolean) {
    const run = await get(userId, id);
    if (!run) throw conversationNotFound();
    if (run.active) return run;
    if (run.status !== 'failed' || !run.failure?.retryable) {
      throw new ApiError(409, 'RUN_NOT_RETRYABLE', 'This coaching run cannot be retried.');
    }
    if (!generationEnabled) throw unavailable();
    await requireTransactionTopology(database);

    return database.transaction(async (session) => {
      const current = await runs.findOne({ _id: id, userId, kind: coachKind }, { session });
      if (current?.kind === coachKind && current.active) return current;
      const conversation = await conversations.findOne({ _id: run.conversationId, userId }, { session });
      if (!conversation) throw conversationNotFound();
      if (!conversation.lastRunId?.equals(id) || conversation.lastSeq !== run.inputSeq) throw superseded();
      if (conversation.pendingRunId) throw turnInProgress();
      const queued = await runs.findOneAndUpdate(
        { _id: id, userId, kind: coachKind, status: 'failed', 'failure.retryable': true },
        { $set: queueState(new Date()), $unset: { failure: '', leaseToken: '' } },
        { session, returnDocument: 'after' },
      );
      if (queued?.kind !== coachKind) throw superseded();
      await conversations.updateOne({ _id: run.conversationId, userId }, { $set: { pendingRunId: id } }, { session });
      return queued;
    });
  }

  async function release(run: CoachRun | SummaryRun, delayMs = 0) {
    const now = new Date();
    await runs.updateOne(currentLease(run), {
      $set: { status: 'queued', availableAt: new Date(now.getTime() + delayMs), updatedAt: now },
      $unset: { leaseToken: '' },
    });
  }

  async function failReply(run: CoachRun, error: ApiError) {
    const retryable = ['AI_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'AI_RUN_EXPIRED'].includes(error.code);
    const message = retryable ? 'Your message is saved. The coach could not reply.' : error.message;
    await database.transaction(async (session) => {
      const saved = await runs.updateOne(currentLease(run), {
        $set: { status: 'failed', active: false, updatedAt: new Date(), failure: { code: error.code, message, retryable } },
        $unset: { leaseToken: '' },
      }, { session });
      if (saved.matchedCount) {
        await conversations.updateOne(
          { _id: run.conversationId, userId: run.userId, pendingRunId: run._id },
          { $set: { pendingRunId: null } }, { session },
        );
      }
    });
  }

  async function processReply(run: CoachRun, ai: AiClient, signal: AbortSignal) {
    try {
      if (signal.aborted) return await release(run);
      if (runExpired(run)) throw new ApiError(503, 'AI_RUN_EXPIRED', 'This coaching run timed out.');
      const profile = await profiles.findOne({ userId: run.userId });
      if (!profile) throw new ApiError(409, 'PROFILE_REQUIRED', 'Save a career profile first.');
      const latest = await messages.find({
        userId: run.userId, conversationId: run.conversationId, seq: { $lte: run.inputSeq },
      }).sort({ seq: -1 }).limit(8).toArray();
      if (!latest[0]?._id.equals(run.userMessageId)) throw superseded();

      const roadmap = await roadmaps.activeFor(run.userId);
      const reply = await writeCoachReply(ai, profile, roadmap, latest, store.recentMemory, signal);
      if (signal.aborted) return await release(run);

      let revision: PreparedRevision | undefined;
      if (reply.revisionRequested && roadmap) {
        try {
          revision = await prepareRoadmapRevision(ai, profile, roadmap, latest[0], signal);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
      }
      if (signal.aborted) return await release(run);
      const proposalId = revision ? new ObjectId() : undefined;
      const proposalAvailability = proposalId ? 'available' as const
        : reply.revisionRequested ? 'unavailable' as const : 'not_requested' as const;

      await database.transaction(async (session) => {
        const now = new Date();
        const assistantMessageId = new ObjectId();
        const result = {
          assistantMessageId, intent: reply.intent, affectedMilestoneIds: reply.affectedMilestoneIds,
          revisionRequested: reply.revisionRequested, proposalAvailability, ...(proposalId ? { proposalId } : {}),
        };
        const owned = await runs.updateOne(currentLease(run), {
          $set: { status: 'succeeded', active: false, result, updatedAt: now },
          $unset: { leaseToken: '' },
        }, { session });
        if (!owned.matchedCount) return;

        const seq = run.inputSeq + 1;
        const advanced = await conversations.updateOne({
          _id: run.conversationId, userId: run.userId, pendingRunId: run._id, lastSeq: run.inputSeq,
        }, {
          $set: { lastSeq: seq, lastCompletedSeq: seq, lastCompletedTurnAt: now, pendingRunId: null, updatedAt: now },
        }, { session });
        if (!advanced.matchedCount) throw superseded();

        await messages.insertOne({
          _id: assistantMessageId, userId: run.userId, conversationId: run.conversationId,
          seq, role: 'assistant', text: reply.reply, runId: run._id, createdAt: now,
        }, { session });
        if (proposalId && revision && roadmap) {
          await proposals.save({
            ...revision, _id: proposalId, userId: run.userId, roadmapId: roadmap.roadmapId,
            runId: run._id, conversationId: run.conversationId, sourceMessageId: run.userMessageId,
            baseRoadmapVersion: roadmap.version, baseProfileVersion: profile.version, createdAt: now,
          }, session);
        }
        const summaryFilter = { userId: run.userId, conversationId: run.conversationId, kind: summaryKind, active: true };
        await runs.updateOne(summaryFilter, {
          $setOnInsert: { ...summaryFilter, ...queueState(now), _id: new ObjectId(), createdAt: now },
        }, { session, upsert: true });
      });
    } catch (error) {
      if (signal.aborted) return await release(run);
      if (!(error instanceof ApiError)) throw error;
      await failReply(run, error);
    }
  }

  async function finishSummary(run: SummaryRun, target: number, draft?: SessionSummary, error?: ApiError) {
    await database.transaction(async (session) => {
      const filter = { _id: run.conversationId, userId: run.userId };
      const conversation = await conversations.findOne(filter, { session });
      const now = new Date();
      const current = conversation?.summary?.throughSeq ?? 0;
      const next = draft && draft.throughSeq > current ? draft : undefined;
      const more = (conversation?.lastCompletedSeq ?? 0) > (error ? target : next?.throughSeq ?? current);
      const outcome = more ? queueState(now) : {
        status: error ? 'failed' as const : 'succeeded' as const, active: false, updatedAt: now,
      };
      const owned = await runs.updateOne(currentLease(run), {
        $set: outcome, $unset: { leaseToken: '' },
      }, { session });
      if (!owned.matchedCount || !conversation) return;

      // Serialize completion of a summary job with a newer reply deciding whether to enqueue one.
      await conversations.updateOne(filter, {
        $inc: { summaryRevision: 1 }, ...(next ? { $set: { summary: next } } : {}),
      }, { session });
    });
  }

  async function processSummary(run: SummaryRun, ai: AiClient, signal: AbortSignal) {
    const conversation = await conversations.findOne({ _id: run.conversationId, userId: run.userId });
    const target = conversation?.lastCompletedSeq ?? 0;
    try {
      if (signal.aborted) return await release(run);
      if (runExpired(run)) throw new ApiError(503, 'AI_RUN_EXPIRED', 'Summary refresh timed out.');
      const previous = conversation?.summary;
      const span = await messages.find({
        userId: run.userId, conversationId: run.conversationId, seq: { $gt: previous?.throughSeq ?? 0, $lte: target },
      }).sort({ seq: 1 }).limit(4).toArray();
      const summary = span.length ? await summarizeConversation(ai, previous, span, signal) : undefined;
      if (signal.aborted) return await release(run);
      await finishSummary(run, target, summary);
    } catch (error) {
      if (signal.aborted) return await release(run);
      if (!(error instanceof ApiError)) throw error;
      if (run.attempts < 3 && !runExpired(run)) {
        await release(run, run.attempts * 3_000);
        return;
      }
      await finishSummary(run, target, undefined, error);
    }
  }

  async function claimWork(
    kind: JobKind, ai: AiClient, signal: AbortSignal,
    target?: { _id: ObjectId } | { userId: ObjectId; conversationId: ObjectId },
  ) {
    const now = new Date();
    const run = await runs.findOneAndUpdate(
      { ...target, kind, active: true, availableAt: { $lte: now } },
      claimLease(ai.leaseMs(kind === 'coach_turn' ? 4 : 2), now), { sort: { availableAt: 1, _id: 1 }, returnDocument: 'after' },
    );
    if (!run) return undefined;
    return () => run.kind === coachKind ? processReply(run, ai, signal) : processSummary(run, ai, signal);
  }

  return { get, send, retry, claimWork };
}

export type CoachingRuns = ReturnType<typeof createCoachingRuns>;
