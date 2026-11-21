import { MongoClient, MongoError, MongoServerError, type ClientSession, type Db } from 'mongodb';

export const CAREER_PROFILES_COLLECTION = 'careerProfiles';

export function isDuplicateKey(error: unknown) {
  return error instanceof MongoServerError && error.code === 11000;
}

async function initializeMongoIndexes(db: Db): Promise<void> {
  await db.collection('users').createIndexes([
    { name: 'users_email_canonical_unique', key: { emailCanonical: 1 }, unique: true },
    {
      name: 'users_google_sub_unique',
      key: { googleSub: 1 },
      unique: true,
      partialFilterExpression: { googleSub: { $type: 'string' } },
    },
  ]);

  await db.collection('authSessions').createIndex(
    { expiresAt: 1 },
    { name: 'auth_sessions_expiry', expireAfterSeconds: 0 },
  );

  await db.collection(CAREER_PROFILES_COLLECTION).createIndex(
    { userId: 1 },
    { name: 'career_profiles_user_unique', unique: true },
  );

  await db.collection('roadmaps').createIndex({ userId: 1 }, { name: 'roadmaps_user_unique', unique: true });
  await db.collection('roadmapVersions').createIndexes([
    { name: 'roadmap_version_unique', key: { roadmapId: 1, version: 1 }, unique: true },
    { name: 'roadmap_versions_owner_history', key: { userId: 1, version: -1 } },
    { name: 'roadmap_versions_owner_activity', key: { userId: 1, createdAt: 1 } },
  ]);
  await db.collection('progressEvents').createIndex({ userId: 1, roadmapId: 1, version: -1 });
  await db.collection('roadmapOperations').createIndex({ userId: 1, key: 1 }, { unique: true });
  await db.collection('roadmapProposals').createIndex({ runId: 1 }, { unique: true });
  await db.collection('aiRuns').createIndexes([
    { name: 'ai_run_key_unique', key: { userId: 1, kind: 1, key: 1 }, unique: true },
    {
      name: 'ai_run_active_owner_unique',
      key: { userId: 1, kind: 1 },
      unique: true,
      partialFilterExpression: { active: true },
    },
    { name: 'ai_run_claim', key: { kind: 1, active: 1, availableAt: 1, _id: 1 } },
    { name: 'ai_run_owner_latest', key: { userId: 1, kind: 1, active: -1, updatedAt: -1, _id: -1 } },
  ]);
  await db.collection('conversations').createIndexes([
    { name: 'conversation_owner_history', key: { userId: 1, updatedAt: -1, _id: -1 } },
    {
      name: 'conversation_owner_active_memory', key: { userId: 1, lastCompletedTurnAt: -1, _id: -1 },
      partialFilterExpression: { lastCompletedTurnAt: { $type: 'date' } },
    },
  ]);
  await db.collection('messages').createIndexes([
    { name: 'message_conversation_sequence', key: { conversationId: 1, seq: 1 }, unique: true },
    { name: 'message_owner_activity', key: { userId: 1, role: 1, createdAt: 1 } },
  ]);
  await db.collection('coachRuns').createIndexes([
    {
      name: 'coach_run_request_unique', key: { userId: 1, conversationId: 1, kind: 1, key: 1 },
      unique: true, partialFilterExpression: { kind: 'coach_turn' },
    },
    {
      name: 'coach_run_active_unique', key: { userId: 1, conversationId: 1, kind: 1 },
      unique: true, partialFilterExpression: { active: true },
    },
    { name: 'coach_run_claim', key: { kind: 1, active: 1, availableAt: 1, _id: 1 } },
  ]);
}

export function createMongoDatabase(env: NodeJS.ProcessEnv) {
  if (env.MONGODB_URI === undefined && env.MONGODB_DB === undefined) return undefined;

  const uri = env.MONGODB_URI?.trim();
  const dbName = env.MONGODB_DB?.trim();

  if (!uri) throw new Error('MONGODB_URI is required when MongoDB is configured.');
  if (!dbName) throw new Error('MONGODB_DB is required when MongoDB is configured.');
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName) || ['admin', 'config', 'local'].includes(dbName.toLowerCase())) {
    throw new Error('MONGODB_DB must name an application database using 1–63 letters, numbers, underscores, or hyphens.');
  }

  let client: MongoClient;
  try {
    client = new MongoClient(uri, {
      appName: 'ai-career-agent',
      connectTimeoutMS: 2_000,
      serverSelectionTimeoutMS: 2_000,
      waitQueueTimeoutMS: 2_000,
      socketTimeoutMS: 5_000,
    });
  } catch {
    throw new Error('MONGODB_URI must be a valid MongoDB connection string.');
  }

  if (env.VERCEL === '1' && client.options.hosts.some(({ host, socketPath }) =>
    socketPath || host === 'localhost' || host === '::1' || host?.startsWith('127.'))) {
    throw new Error('Vercel requires a hosted MongoDB deployment.');
  }

  const db = client.db(dbName, { readPreference: 'primary', writeConcern: { w: 'majority' } });
  let indexesReady = false;
  let reportedFailure = false;
  let closing = false;
  let pendingCheck: Promise<boolean> | undefined;
  let transactionTopology = false;

  async function supportsTransactions(): Promise<boolean> {
    if (transactionTopology) return true;
    const topology = await db.command({ hello: 1 }, { signal: AbortSignal.timeout(3_000) });
    transactionTopology = typeof topology.logicalSessionTimeoutMinutes === 'number' &&
      (typeof topology.setName === 'string' || topology.msg === 'isdbgrid');
    return transactionTopology;
  }

  function transaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    return client.withSession((session) => session.withTransaction(
      () => operation(session),
      { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5_000 },
    ));
  }

  async function probeMongo(): Promise<boolean> {
    try {
      // An initial connection failure leaves the topology closed. Connect again before pinging.
      await client.connect();
      if (closing) return false;

      await db.command({ ping: 1 }, {
        readPreference: 'primary',
        signal: AbortSignal.timeout(3_000),
      });
      if (closing) return false;

      if (!indexesReady) {
        await initializeMongoIndexes(db);
        indexesReady = true;
      }

      reportedFailure = false;
      return !closing;
    } catch (error) {
      if (!closing && !reportedFailure) {
        const category = error instanceof MongoError ? error.name : 'MongoReadinessError';
        const code = error instanceof MongoError && typeof error.code === 'number' ? error.code : undefined;
        console.warn('MongoDB readiness check failed', { category, code });
        reportedFailure = true;
      }
      return false;
    }
  }

  function checkReadiness(): Promise<boolean> {
    if (closing) return Promise.resolve(false);

    pendingCheck ??= probeMongo().finally(() => {
      pendingCheck = undefined;
    });
    return pendingCheck;
  }

  async function close(): Promise<void> {
    closing = true;
    try {
      await pendingCheck;
    } finally {
      await client.close();
    }
  }

  return { db, checkReadiness, supportsTransactions, transaction, close };
}

export type MongoDatabase = NonNullable<ReturnType<typeof createMongoDatabase>>;
