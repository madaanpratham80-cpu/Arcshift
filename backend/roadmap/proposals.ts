import type { ClientSession, ObjectId } from 'mongodb';
import type { MongoDatabase } from '../db/mongo.ts';
import { ApiError } from '../http-errors.ts';
import { careerProfiles } from '../profile/store.ts';
import type { PreparedRevision } from './revision.ts';
import { roadmapNotFound, type RoadmapStore } from './store.ts';

interface ProposalInput extends PreparedRevision {
  _id: ObjectId;
  userId: ObjectId;
  roadmapId: ObjectId;
  runId: ObjectId;
  conversationId: ObjectId;
  sourceMessageId: ObjectId;
  baseRoadmapVersion: number;
  baseProfileVersion: number;
  createdAt: Date;
}

interface Proposal extends ProposalInput {
  status: 'pending' | 'applied';
  appliedVersion?: number;
  appliedAt?: Date;
}

function proposalStale() {
  return new ApiError(409, 'PROPOSAL_STALE', 'Your profile or roadmap changed. Ask the coach for an updated proposal.');
}

export function createRoadmapProposals(database: MongoDatabase, roadmaps: RoadmapStore) {
  const proposals = database.db.collection<Proposal>('roadmapProposals');
  const profiles = careerProfiles(database.db);

  async function save(input: ProposalInput, session: ClientSession) {
    await proposals.insertOne({ ...input, status: 'pending' }, { session });
  }

  async function get(userId: ObjectId, proposalId: ObjectId) {
    const proposal = await proposals.findOne({ _id: proposalId, userId });
    if (!proposal) throw roadmapNotFound();

    let status: 'pending' | 'applied' | 'stale' = proposal.status;
    if (status === 'pending') {
      const [profile, active] = await Promise.all([
        profiles.findOne({ userId }, { projection: { version: 1 } }),
        roadmaps.activeFor(userId),
      ]);
      if (profile?.version !== proposal.baseProfileVersion ||
          active?.version !== proposal.baseRoadmapVersion || !active.roadmapId.equals(proposal.roadmapId)) {
        status = 'stale';
      }
    }

    return {
      id: proposal._id.toHexString(), roadmapId: proposal.roadmapId.toHexString(), runId: proposal.runId.toHexString(),
      conversationId: proposal.conversationId.toHexString(), sourceMessageId: proposal.sourceMessageId.toHexString(),
      baseRoadmapVersion: proposal.baseRoadmapVersion, baseProfileVersion: proposal.baseProfileVersion,
      rationale: proposal.rationale, diff: proposal.diff, status, createdAt: proposal.createdAt,
      appliedVersion: proposal.appliedVersion ?? null, appliedAt: proposal.appliedAt ?? null,
    };
  }

  async function apply(userId: ObjectId, proposalId: ObjectId) {
    return database.transaction(async (session) => {
      const proposal = await proposals.findOne({ _id: proposalId, userId }, { session });
      if (!proposal) throw roadmapNotFound();
      if (proposal.status === 'applied' && proposal.appliedVersion) {
        const version = await roadmaps.versionFor(userId, proposal.appliedVersion, session);
        if (!version || !version.roadmapId.equals(proposal.roadmapId)) throw new Error('Applied proposal version is missing.');
        return version;
      }

      const currentProfile = await profiles.updateOne(
        { userId, version: proposal.baseProfileVersion },
        { $inc: { roadmapGuard: 1 } }, { session },
      );
      if (!currentProfile.matchedCount) throw proposalStale();

      const now = new Date();
      const version = await roadmaps.publishRevision({ ...proposal, proposalId }, now, session);
      if (!version) throw proposalStale();

      const updated = await proposals.updateOne({ _id: proposalId, userId, status: 'pending' }, {
        $set: { status: 'applied', appliedVersion: version.version, appliedAt: now },
      }, { session });
      if (!updated.matchedCount) throw proposalStale();
      return version;
    });
  }

  return { save, get, apply };
}

export type RoadmapProposals = ReturnType<typeof createRoadmapProposals>;
