import bcrypt from 'bcrypt';
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ObjectId, type Db } from 'mongodb';
import { z } from 'zod';
import { isDuplicateKey } from '../db/mongo.ts';
import { ApiError, sendApiError } from '../http-errors.ts';
import { careerProfiles } from '../profile/store.ts';
import { assertAppOrigin, requireDatabaseReady } from '../request-guards.ts';
import type { AuthConfig } from './config.ts';
import {
  GOOGLE_FLOW_MS,
  createGoogleFlow,
  createGoogleProvider,
  readGoogleFlow,
  signGoogleFlow,
  type GoogleProvider,
} from './google.ts';
import { createAuthCookies, createSessionManager, publicAccount, type Account } from './sessions.ts';

const BCRYPT_COST = 12;
const DUMMY_PASSWORD_HASH = '$2b$12$YjKSnqdWfiyxDJ9pIPJDDeDkl3kC.qcRD3mQhA6QzgNvYVHmyhj.C';
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
const passwordSchema = z.string().min(1).refine((value) => value.isWellFormed() && Buffer.byteLength(value) <= 72);
const loginSchema = z.strictObject({ email: emailSchema, password: passwordSchema });
const registrationSchema = loginSchema.extend({ password: passwordSchema.refine((value) => [...value].length >= 15) });
const linkSchema = z.strictObject({ password: passwordSchema });

function payload<T>(schema: z.ZodType<T>, request: Request): T {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Review the submitted fields and try again.');
  }
  return parsed.data;
}

function invalidCredentials() {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'That email and password didn’t match. Try again.');
}

function googleUnavailable() {
  return new ApiError(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is temporarily unavailable.');
}

export function createAuthRouter(
  db: Db,
  config: AuthConfig,
  checkReadiness: () => Promise<boolean>,
  google = config.google ? createGoogleProvider(config.google) : undefined,
) {
  const router = express.Router();
  const accounts = db.collection<Account>('users');
  const profiles = careerProfiles(db);
  const sessions = createSessionManager(db, config);
  const cookies = createAuthCookies(config);
  const json = express.json({ limit: '8kb' });
  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      sendApiError(response, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    },
  });

  router.use((request, response, next) => {
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (request.method === 'POST') assertAppOrigin(request, config.origin);
    next();
  });

  router.post(['/register', '/login', '/google/link'], passwordLimiter);
  router.use(requireDatabaseReady(checkReadiness));

  router.post('/register', json, async (request, response) => {
    const { email, password } = payload(registrationSchema, request);
    if (email === config.adminEmail) {
      throw new ApiError(409, 'ACCOUNT_CREATION_FAILED', 'We couldn’t create an account with those details.');
    }
    const account: Account = {
      _id: new ObjectId(),
      emailCanonical: email,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      createdAt: new Date(),
    };

    try {
      await accounts.insertOne(account);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      throw new ApiError(409, 'ACCOUNT_CREATION_FAILED', 'We couldn’t create an account with those details.');
    }

    await sessions.issue(response, account);
    response.status(201).json({ data: { user: publicAccount(account) } });
  });

  router.post('/login', json, async (request, response) => {
    const { email, password } = payload(loginSchema, request);
    const account = await accounts.findOne({ emailCanonical: email });
    const matches = await bcrypt.compare(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!account?.passwordHash || !matches) throw invalidCredentials();

    await sessions.issue(response, account);
    response.json({ data: { user: publicAccount(account) } });
  });

  router.get('/session', async (request, response) => {
    const { account } = await sessions.authenticate(request);
    const profile = await profiles.findOne({ userId: account._id }, { projection: { _id: 1 } });
    response.json({ data: { user: publicAccount(account), onboardingComplete: profile !== null } });
  });

  router.post('/refresh', async (request, response) => {
    const account = await sessions.renew(request, response);
    response.json({ data: { user: publicAccount(account) } });
  });

  router.post('/logout', async (request, response) => {
    await sessions.logout(request, response);
    response.status(204).end();
  });

  function googleResult(response: Response, result: string) {
    response.redirect(303, '/?auth=' + result);
  }

  async function beginGoogle(response: Response, provider: GoogleProvider, flow: ReturnType<typeof createGoogleFlow>) {
    cookies.set(response, 'google', await signGoogleFlow(flow, config), GOOGLE_FLOW_MS);
    return provider.authorizationUrl(flow);
  }

  router.get('/google/start', async (request, response) => {
    if (!google) throw googleUnavailable();
    const url = await beginGoogle(response, google, createGoogleFlow({ mode: 'signin', destination: request.query.next === 'admin' ? 'admin' : undefined }));
    if (request.accepts(['html', 'json']) === 'json') {
      response.json({ data: { authorizationUrl: url } });
      return;
    }
    response.redirect(302, url);
  });

  router.post('/google/link', json, async (request, response) => {
    if (!google) throw googleUnavailable();
    const { account, sessionId } = await sessions.authenticate(request);
    const { password } = payload(linkSchema, request);
    if (!account.passwordHash || !await bcrypt.compare(password, account.passwordHash)) {
      throw invalidCredentials();
    }
    if (account.googleSub) {
      throw new ApiError(409, 'GOOGLE_ALREADY_LINKED', 'This account already has Google sign-in connected.');
    }

    const authorizationUrl = await beginGoogle(response, google, createGoogleFlow({
      mode: 'link', userId: account._id.toHexString(), sessionId: sessionId.toHexString(),
    }));
    response.json({ data: { authorizationUrl } });
  });

  async function finishGoogleLink(request: Request, response: Response, subject: string, userId: string, sessionId: string) {
    const current = await sessions.authenticate(request).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'SIGN_IN_REQUIRED') return undefined;
      throw error;
    });
    if (!current?.account._id.equals(userId) || !current.sessionId.equals(sessionId)) {
      googleResult(response, 'google_failed');
      return;
    }
    try {
      const update = await accounts.updateOne(
        { _id: current.account._id, $or: [{ googleSub: { $exists: false } }, { googleSub: subject }] },
        { $set: { googleSub: subject } },
      );
      googleResult(response, update.matchedCount ? 'google_linked' : 'google_link_conflict');
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      googleResult(response, 'google_link_conflict');
    }
  }

  async function finishGoogleSignIn(response: Response, subject: string, email: string, destination?: 'admin') {
    let account = await accounts.findOne({ googleSub: subject });
    if (!account) {
      const newAccount: Account = {
        _id: new ObjectId(), emailCanonical: email, googleSub: subject, createdAt: new Date(),
      };
      try {
        await accounts.insertOne(newAccount);
        account = newAccount;
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        account = await accounts.findOne({ googleSub: subject });
      }
    }
    if (!account) {
      googleResult(response, 'google_link_required');
      return;
    }
    await sessions.issue(response, account, email);
    if (destination === 'admin') {
      response.redirect(303, '/admin');
      return;
    }
    googleResult(response, 'google_signed_in');
  }

  router.get('/google/callback', async (request, response) => {
    if (!google) throw googleUnavailable();
    const flow = await readGoogleFlow(cookies.read(request, 'google'), config);
    const code = request.query.code;
    if (!flow || request.query.state !== flow.state) {
      googleResult(response, 'google_failed');
      return;
    }
    cookies.clear(response, 'google');
    if (request.query.error || typeof code !== 'string' || !code || code.length > 4_096) {
      googleResult(response, 'google_failed');
      return;
    }

    const identity = await google.exchangeIdentity(code, flow).catch(() => undefined);
    const email = emailSchema.safeParse(identity?.email);
    if (!identity || !email.success) {
      googleResult(response, 'google_failed');
      return;
    }

    if (flow.mode === 'link') {
      await finishGoogleLink(request, response, identity.subject, flow.userId, flow.sessionId);
      return;
    }
    await finishGoogleSignIn(response, identity.subject, email.data, flow.destination);
  });

  return router;
}
