import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createActivityRouter } from './activity.ts';
import { createAdminRouter } from './admin/routes.ts';
import { createAiClient, readAiConfig } from './ai/client.ts';
import { createAiRunRouter } from './ai/routes.ts';
import { startAiWorker } from './ai/worker.ts';
import { createApp } from './app.ts';
import { readAuthConfig } from './auth/config.ts';
import { createAuthRouter } from './auth/routes.ts';
import { createConversationRouter } from './coaching/routes.ts';
import { createCoachingRuns } from './coaching/runs.ts';
import { createConversationStore } from './coaching/store.ts';
import { createMongoDatabase } from './db/mongo.ts';
import { sendApiError } from './http-errors.ts';
import { createProfileRouter } from './profile/routes.ts';
import { createRoadmapRouter } from './roadmap/routes.ts';
import { createRoadmapProposals } from './roadmap/proposals.ts';
import { createRoadmapRuns } from './roadmap/runs.ts';
import { createRoadmapStore } from './roadmap/store.ts';

function startServer() {
  const production = process.env.NODE_ENV === 'production';
  const host = process.env.HOST?.trim() || '127.0.0.1';
  const configuredPort = process.env.PORT ?? '3000';
  const port = Number(configuredPort);

  if (!/^\d+$/.test(configuredPort) || port < 1 || port > 65_535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
    return;
  }

  let database: ReturnType<typeof createMongoDatabase>;
  let authConfig: ReturnType<typeof readAuthConfig>;
  let aiConfig: ReturnType<typeof readAiConfig>;
  try {
    authConfig = readAuthConfig(process.env);
    database = createMongoDatabase(process.env);
    aiConfig = readAiConfig(process.env);
    if (production && !authConfig) throw new Error('Production requires authentication configuration.');
    if (authConfig && !database) throw new Error('Authentication requires MongoDB configuration.');
    if (aiConfig && !authConfig) throw new Error('AI features require authentication configuration.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'API configuration is invalid.');
    process.exitCode = 1;
    return;
  }

  const api = express.Router();
  let startWorker: (() => () => Promise<void>) | undefined;
  let stopWorker: (() => Promise<void>) | undefined;
  if (authConfig && database) {
    api.use('/activity', createActivityRouter(database.db, authConfig, database.checkReadiness));
    api.use('/admin', createAdminRouter(database.db, authConfig, database.checkReadiness));
    api.use('/auth', createAuthRouter(database.db, authConfig, database.checkReadiness));
    api.use('/profile', createProfileRouter(database.db, authConfig, database.checkReadiness));
    const roadmap = createRoadmapStore(database);
    const proposals = createRoadmapProposals(database, roadmap);
    const runs = createRoadmapRuns(database, roadmap);
    const conversations = createConversationStore(database.db);
    const coachingRuns = createCoachingRuns(database, conversations, roadmap, proposals);
    api.use(createRoadmapRouter(database, authConfig, roadmap, runs, proposals, aiConfig !== undefined));
    api.use('/conversations', createConversationRouter(database, authConfig, conversations, coachingRuns, aiConfig !== undefined));
    api.use('/ai/runs', createAiRunRouter(database, authConfig, runs, coachingRuns, aiConfig !== undefined));
    if (aiConfig) {
      const ai = createAiClient(aiConfig);
      startWorker = () => startAiWorker(database, [
        (signal) => runs.claimWork(ai, signal),
        (signal) => coachingRuns.claimWork('coach_turn', ai, signal),
        (signal) => coachingRuns.claimWork('session_summary', ai, signal),
      ]);
    }
  } else {
    api.use(['/auth', '/activity', '/admin', '/profile', '/roadmap', '/conversations', '/ai/runs'], (_request, response) => {
      sendApiError(response, 503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    });
  }
  async function checkReleaseReadiness(): Promise<boolean> {
    if (!database || !await database.checkReadiness()) return false;
    if (!production && !aiConfig) return true;
    return database.supportsTransactions().catch(() => false);
  }

  const webRoot = fileURLToPath(new URL('../dist/web/', import.meta.url));
  const hasWebBuild = existsSync(new URL('../dist/web/index.html', import.meta.url));
  const app = createApp(api, checkReleaseReadiness, hasWebBuild ? webRoot : undefined);
  if (authConfig?.trustProxyHops !== undefined) app.set('trust proxy', authConfig.trustProxyHops);
  const server = app.listen(port, host);

  async function closeDatabase() {
    try {
      await stopWorker?.();
      await database?.close();
    } catch {
      console.error('MongoDB client could not shut down cleanly.');
      process.exitCode = 1;
    }
  }

  server.once('listening', () => {
    console.info('Arcshift API listening', { host, port });
    void database?.checkReadiness();
    stopWorker = startWorker?.();
  });

  server.once('error', (error: NodeJS.ErrnoException) => {
    console.error('Arcshift API server error', { code: error.code });
    process.exitCode = 1;
    void closeDatabase();
  });

  let stopping = false;

  function stopServer() {
    if (stopping) return;

    stopping = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();

    server.close((error) => {
      clearTimeout(deadline);
      if (error) {
        console.error('Arcshift API could not shut down cleanly', { message: error.message });
        process.exitCode = 1;
      }
      void closeDatabase();
    });
  }

  process.on('SIGINT', stopServer);
  process.on('SIGTERM', stopServer);
}

startServer();
