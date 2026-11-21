import express from 'express';
import { createActivityRouter } from './activity.ts';
import { createAdminRouter } from './admin/routes.ts';
import { createAiClient, readAiConfig } from './ai/client.ts';
import { createAiRunRouter } from './ai/routes.ts';
import { startAiWorker, type RunDispatch, type WorkScheduler } from './ai/worker.ts';
import { createApp, type WebBuild } from './app.ts';
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

export function createRuntime(env: NodeJS.ProcessEnv, web?: WebBuild, schedule?: WorkScheduler) {
  const production = env.NODE_ENV === 'production';
  const authConfig = readAuthConfig(env);
  const database = createMongoDatabase(env);
  const aiConfig = readAiConfig(env);
  if (production && !authConfig) throw new Error('Production requires authentication configuration.');
  if (authConfig && !database) throw new Error('Authentication requires MongoDB configuration.');
  if (aiConfig && !authConfig) throw new Error('AI features require authentication configuration.');

  const api = express.Router();
  let startWorker: (() => () => Promise<void>) | undefined;
  let dispatch: RunDispatch | undefined;
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
    if (aiConfig) {
      const ai = createAiClient(aiConfig);
      if (schedule) {
        dispatch = (target) => {
          if (target.kind !== 'session_summary' && (!target.active || target.availableAt.getTime() > Date.now())) return;
          schedule(async (signal) => {
            if (signal.aborted || !await database.supportsTransactions()) return;
            if (target.kind === 'initial_roadmap') {
              const job = await runs.claimWork(ai, signal, target._id);
              await job?.();
              return;
            }
            if (target.kind === 'coach_turn') {
              const job = await coachingRuns.claimWork('coach_turn', ai, signal, { _id: target._id });
              await job?.();
            }
            if (signal.aborted) return;
            const summary = await coachingRuns.claimWork('session_summary', ai, signal, {
              userId: target.userId, conversationId: target.conversationId,
            });
            await summary?.();
          });
        };
      } else {
        startWorker = () => startAiWorker(database, [
          (signal) => runs.claimWork(ai, signal),
          (signal) => coachingRuns.claimWork('coach_turn', ai, signal),
          (signal) => coachingRuns.claimWork('session_summary', ai, signal),
        ]);
      }
    }
    api.use(createRoadmapRouter(database, authConfig, roadmap, runs, proposals, aiConfig !== undefined, dispatch));
    api.use('/conversations', createConversationRouter(database, authConfig, conversations, coachingRuns, aiConfig !== undefined, dispatch));
    api.use('/ai/runs', createAiRunRouter(database, authConfig, runs, coachingRuns, aiConfig !== undefined, dispatch));
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

  const app = createApp(api, checkReleaseReadiness, web);
  if (authConfig?.trustProxyHops !== undefined) app.set('trust proxy', authConfig.trustProxyHops);
  return { app, database, startWorker };
}
