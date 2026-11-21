import { createHash } from 'node:crypto';
import { ObjectId, type ClientSession } from 'mongodb';
import { isDuplicateKey, type MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import type { MilestoneStatus, RoadmapDraft } from './model.ts';
import type { PreparedRevision, RevisionDiff } from './revision.ts';

interface Roadmap {
  _id: ObjectId;
  userId: ObjectId;
  activeVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

type RoadmapChange = { type: 'generated' }
| { type: 'ai_revision'; proposalId: string; rationale: string; diff: RevisionDiff[] }
| {
  type: 'milestone_progress';
  milestoneId: string;
  fromStatus: MilestoneStatus;
  toStatus: MilestoneStatus;
  evidenceChanged: boolean;
};

export interface RoadmapVersion extends RoadmapDraft {
  _id: ObjectId;
  roadmapId: ObjectId;
  userId: ObjectId;
  version: number;
  profileVersion: number;
  createdAt: Date;
  change: RoadmapChange;
}

interface UpdateReceipt {
  userId: ObjectId;
  key: string;
  fingerprint: string;
  version: number;
}

interface MilestonePatch {
  expectedRoadmapVersion: number;
  status: MilestoneStatus;
  evidenceUrl?: string | null;
}

export function roadmapExists() {
  return new ApiError(409, 'ROADMAP_EXISTS', 'A roadmap is already saved. Open your current roadmap.');
}

export function profileVersionConflict() {
  return new ApiError(409, 'PROFILE_VERSION_CONFLICT', 'Your profile changed. Reload it before generating a roadmap.');
}

export function idempotencyConflict() {
  return new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used with different input.');
}

export function roadmapNotFound() {
  return new ApiError(404, 'NOT_FOUND', 'This roadmap resource is unavailable.');
}

function roadmapVersionConflict() {
  return new ApiError(409, 'ROADMAP_VERSION_CONFLICT', 'Your roadmap changed. Open the latest version before editing it.');
}

export function publicRoadmap(version: RoadmapVersion | null) {
  if (!version) return null;
  const milestones = version.phases.flatMap((phase) => phase.milestones);

  return {
    id: version.roadmapId.toHexString(),
    version: version.version,
    profileVersion: version.profileVersion,
    targetRole: version.targetRole,
    assumptions: version.assumptions,
    phases: version.phases,
    change: version.change,
    createdAt: version.createdAt,
    progress: {
      completedCount: milestones.filter((milestone) => milestone.status === 'completed').length,
      milestoneCount: milestones.length,
      nextMilestoneId: milestones.find((milestone) => milestone.status === 'in_progress')?.id
        ?? milestones.find((milestone) => milestone.status === 'todo')?.id
        ?? null,
    },
  };
}

export function createRoadmapStore(database: MongoDatabase) {
  const roadmaps = database.db.collection<Roadmap>('roadmaps');
  const versions = database.db.collection<RoadmapVersion>('roadmapVersions');
  const receipts = database.db.collection<UpdateReceipt>('roadmapOperations');
  const events = database.db.collection('progressEvents');

  async function versionFor(userId: ObjectId, version: number, session?: ClientSession) {
    return versions.findOne({ userId, version }, { session });
  }

  async function activeFor(userId: ObjectId) {
    const roadmap = await roadmaps.findOne({ userId });
    return roadmap ? versionFor(userId, roadmap.activeVersion) : null;
  }

  async function listVersions(userId: ObjectId, beforeVersion: number | undefined, limit: number) {
    const entries = await versions.find(
      { userId, ...(beforeVersion === undefined ? {} : { version: { $lt: beforeVersion } }) },
      { projection: { _id: 0, version: 1, profileVersion: 1, targetRole: 1, createdAt: 1, change: 1 } },
    ).sort({ version: -1 }).limit(limit + 1).toArray();
    const page = entries.slice(0, limit);
    return {
      versions: page,
      nextCursor: entries.length > limit ? String(page.at(-1)?.version) : null,
    };
  }

  async function publishInitial(
    userId: ObjectId,
    profileVersion: number,
    draft: RoadmapDraft,
    roadmapId: ObjectId,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    if (await roadmaps.findOne({ userId }, { session })) throw roadmapExists();

    await roadmaps.insertOne({ _id: roadmapId, userId, activeVersion: 1, createdAt: now, updatedAt: now }, { session });
    await versions.insertOne({
      ...draft, _id: new ObjectId(), roadmapId, userId, version: 1,
      profileVersion, createdAt: now, change: { type: 'generated' },
    }, { session });
  }

  async function advanceRoadmap(
    roadmapId: ObjectId, userId: ObjectId, previousVersion: number, now: Date, session: ClientSession,
  ) {
    const moved = await roadmaps.updateOne(
      { _id: roadmapId, userId, activeVersion: previousVersion },
      { $set: { activeVersion: previousVersion + 1, updatedAt: now } }, { session },
    );
    return moved.matchedCount > 0;
  }

  async function publishRevision(input: PreparedRevision & {
    proposalId: ObjectId;
    userId: ObjectId;
    roadmapId: ObjectId;
    baseRoadmapVersion: number;
    baseProfileVersion: number;
  }, now: Date, session: ClientSession) {
    if (!await advanceRoadmap(input.roadmapId, input.userId, input.baseRoadmapVersion, now, session)) return null;
    const version = input.baseRoadmapVersion + 1;
    const phases = input.draft.phases.map((phase) => ({
      ...phase,
      milestones: phase.milestones.map((milestone) => ({
        ...milestone,
        completedAt: milestone.status === 'completed' ? milestone.completedAt ?? now : null,
      })),
    }));
    const diff = input.diff.map((entry) => {
      if (entry.type === 'milestone_status' && entry.after?.status === 'completed') {
        return { ...entry, after: { ...entry.after, completedAt: now } };
      }
      return entry;
    });
    const snapshot: RoadmapVersion = {
      ...input.draft, phases, _id: new ObjectId(), roadmapId: input.roadmapId, userId: input.userId,
      version, profileVersion: input.baseProfileVersion, createdAt: now,
      change: { type: 'ai_revision', proposalId: input.proposalId.toHexString(), rationale: input.rationale, diff },
    };
    await versions.insertOne(snapshot, { session });

    const progress = diff.flatMap((entry) => {
      if (entry.type !== 'milestone_status' || !entry.before || !entry.after) return [];
      return [{
        type: 'milestone_progress', userId: input.userId, roadmapId: input.roadmapId, version,
        milestoneId: entry.milestoneId, fromStatus: entry.before.status, toStatus: entry.after.status,
        evidenceChanged: false, evidenceUrl: entry.after.evidenceUrl, occurredAt: now,
        proposalId: input.proposalId, sourceMessageId: entry.sourceMessageId,
      }];
    });
    if (progress.length) await events.insertMany(progress, { session });
    return snapshot;
  }

  async function updateMilestone(userId: ObjectId, milestoneId: string, key: string, patch: MilestonePatch) {
    const fingerprint = createHash('sha256').update(JSON.stringify([
      milestoneId, patch.expectedRoadmapVersion, patch.status, patch.evidenceUrl === undefined, patch.evidenceUrl,
    ])).digest('hex');

    async function readReceipt(receipt: UpdateReceipt, session?: ClientSession) {
      if (receipt.fingerprint !== fingerprint) throw idempotencyConflict();
      const saved = await versionFor(userId, receipt.version, session);
      if (!saved) throw new Error('Roadmap receipt points to a missing version.');
      return saved;
    }

    try {
      return await database.transaction(async (session) => {
        const receipt = await receipts.findOne({ userId, key }, { session });
        if (receipt) return readReceipt(receipt, session);

        const roadmap = await roadmaps.findOne({ userId }, { session });
        if (!roadmap) throw roadmapNotFound();
        if (roadmap.activeVersion !== patch.expectedRoadmapVersion) throw roadmapVersionConflict();

        const previous = await versionFor(userId, roadmap.activeVersion, session);
        if (!previous) throw new Error('Active roadmap version is missing.');
        const milestone = previous.phases.flatMap((phase) => phase.milestones).find((entry) => entry.id === milestoneId);
        if (!milestone) throw roadmapNotFound();

        const evidenceUrl = patch.evidenceUrl === undefined ? milestone.evidenceUrl : patch.evidenceUrl;
        const evidenceChanged = evidenceUrl !== milestone.evidenceUrl;
        if (milestone.status === patch.status && !evidenceChanged) {
          await receipts.insertOne({ userId, key, fingerprint, version: previous.version }, { session });
          return previous;
        }

        const now = new Date();
        const version = previous.version + 1;
        if (!await advanceRoadmap(roadmap._id, userId, previous.version, now, session)) throw roadmapVersionConflict();

        const nextMilestone = {
          ...milestone, status: patch.status, evidenceUrl,
          completedAt: patch.status === 'completed' ? milestone.completedAt ?? now : null,
        };
        const change = {
          type: 'milestone_progress' as const, milestoneId,
          fromStatus: milestone.status, toStatus: patch.status, evidenceChanged,
        };
        const snapshot: RoadmapVersion = {
          ...previous, _id: new ObjectId(), version, createdAt: now, change,
          phases: previous.phases.map((phase) => ({
            ...phase,
            milestones: phase.milestones.map((entry) => entry.id === milestoneId ? nextMilestone : entry),
          })),
        };

        await versions.insertOne(snapshot, { session });
        await events.insertOne({
          userId, roadmapId: roadmap._id, version, ...change, evidenceUrl, occurredAt: now,
        }, { session });
        await receipts.insertOne({ userId, key, fingerprint, version }, { session });
        return snapshot;
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const receipt = await receipts.findOne({ userId, key });
        if (receipt) return readReceipt(receipt);
      }
      throw error;
    }
  }

  return { activeFor, listVersions, versionFor, publishInitial, publishRevision, updateMilestone };
}

export type RoadmapStore = ReturnType<typeof createRoadmapStore>;
