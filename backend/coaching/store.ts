import { ObjectId, type Db } from 'mongodb';
import { publicProposalHint, type CoachRun } from './runs.ts';

export interface SummaryFact {
  kind: 'goal' | 'skill' | 'constraint' | 'reported_progress' | 'next_step' | 'blocker';
  text: string;
  sourceMessageIds: string[];
}

export interface SessionSummary {
  throughSeq: number;
  facts: SummaryFact[];
}

export interface Conversation {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  autoTitle: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeq: number;
  pendingRunId: ObjectId | null;
  lastRunId: ObjectId | null;
  lastCompletedSeq?: number;
  lastCompletedTurnAt?: Date;
  summary?: SessionSummary;
  summaryRevision?: number;
}

export interface Message {
  _id: ObjectId;
  userId: ObjectId;
  conversationId: ObjectId;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  runId: ObjectId;
  createdAt: Date;
}

export function publicConversation(conversation: Conversation) {
  return {
    id: conversation._id.toHexString(),
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pendingRunId: conversation.pendingRunId?.toHexString() ?? null,
    lastRunId: conversation.lastRunId?.toHexString() ?? null,
  };
}

export function publicMessage(message: Message) {
  return {
    id: message._id.toHexString(),
    seq: message.seq,
    role: message.role,
    text: message.text,
    runId: message.runId.toHexString(),
    createdAt: message.createdAt,
  };
}

interface ConversationCursor {
  updatedAt: Date;
  id: ObjectId;
}

export function createConversationStore(db: Db) {
  const conversations = db.collection<Conversation>('conversations');
  const messages = db.collection<Message>('messages');
  const coachRuns = db.collection<CoachRun>('coachRuns');

  async function create(userId: ObjectId, title?: string) {
    const now = new Date();
    const conversation: Conversation = {
      _id: new ObjectId(), userId, title: title ?? 'New conversation', autoTitle: !title,
      createdAt: now, updatedAt: now, lastSeq: 0, pendingRunId: null, lastRunId: null,
    };
    await conversations.insertOne(conversation);
    return conversation;
  }

  async function list(userId: ObjectId, cursor: ConversationCursor | undefined, limit: number) {
    const result = await conversations.find({
      userId,
      ...(cursor ? { $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
      ] } : {}),
    }).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const page = result.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = result.length > limit && last
      ? Buffer.from(JSON.stringify([last.updatedAt.toISOString(), last._id.toHexString()])).toString('base64url')
      : null;
    return { conversations: page.map(publicConversation), nextCursor };
  }

  async function history(userId: ObjectId, conversationId: ObjectId, before: number | undefined, limit: number) {
    const conversation = await conversations.findOne({ _id: conversationId, userId });
    if (!conversation) return null;
    const result = await messages.find({
      userId, conversationId, ...(before === undefined ? {} : { seq: { $lt: before } }),
    }).sort({ seq: -1 }).limit(limit + 1).toArray();
    const page = result.slice(0, limit).reverse();
    const assistantRuns = page.filter((message) => message.role === 'assistant').map((message) => message.runId);
    const hints = new Map<string, ReturnType<typeof publicProposalHint>>();
    if (assistantRuns.length) {
      const matching = await coachRuns.find({ _id: { $in: assistantRuns }, userId, conversationId, kind: 'coach_turn' }, {
        projection: { result: 1 },
      }).toArray();
      for (const run of matching) {
        if (run.result) hints.set(run.result.assistantMessageId.toHexString(), publicProposalHint(run.result));
      }
    }
    return {
      conversation: publicConversation(conversation),
      messages: page.map((message) => {
        const entry = publicMessage(message);
        return { ...entry, ...hints.get(entry.id) };
      }),
      nextCursor: result.length > limit ? String(page[0].seq) : null,
    };
  }

  async function recentMemory(userId: ObjectId, conversationId: ObjectId, oldestTranscriptSeq: number) {
    const latest = await conversations.find({ userId, lastCompletedTurnAt: { $type: 'date' } }, {
      projection: { _id: 1, summary: 1 },
    }).sort({ lastCompletedTurnAt: -1, _id: -1 }).limit(5).toArray();

    return latest.flatMap((session) => {
      if (!session.summary || (session._id.equals(conversationId) && session.summary.throughSeq >= oldestTranscriptSeq)) {
        return [];
      }
      return [{ conversationId: session._id.toHexString(), ...session.summary }];
    });
  }

  return { conversations, messages, create, list, history, recentMemory };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;
