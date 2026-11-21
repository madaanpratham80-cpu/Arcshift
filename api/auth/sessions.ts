import { createHash, randomBytes } from 'node:crypto';
import { parse as parseCookies } from 'cookie';
import type { Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { ObjectId, type Db } from 'mongodb';
import { ApiError } from '../http-errors.ts';
import type { AuthConfig } from './config.ts';

export const AUTH_ISSUER = 'ai-career-agent';
const ACCESS_AUDIENCE = 'career-agent-api';
const ACCESS_SECONDS = 15 * 60;
const SESSION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

export interface Account {
  _id: ObjectId;
  emailCanonical: string;
  passwordHash?: string;
  googleSub?: string;
  createdAt: Date;
}

interface Session {
  _id: ObjectId;
  userId: ObjectId;
  refreshTokenHash: string;
  googleEmail?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
}

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
}

export function publicAccount(account: Account) {
  return {
    id: account._id.toHexString(),
    email: account.emailCanonical,
    signInMethods: [
      ...(account.passwordHash ? ['password'] : []),
      ...(account.googleSub ? ['google'] : []),
    ],
  };
}

export function signInRequired() {
  return new ApiError(401, 'SIGN_IN_REQUIRED', 'Log in again to continue.');
}

export function createAuthCookies(config: AuthConfig) {
  const prefix = config.secureCookies ? '__Host-' : '';
  const names = {
    access: prefix + 'career_access',
    refresh: prefix + 'career_refresh',
    google: prefix + 'career_google',
  };
  const attributes = { httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const, path: '/' };
  return {
    read(request: Request, name: keyof typeof names) {
      return parseCookies(request.get('cookie') ?? '')[names[name]];
    },
    set(response: Response, name: keyof typeof names, value: string, maxAge: number) {
      response.cookie(names[name], value, { ...attributes, maxAge });
    },
    clear(response: Response, name: keyof typeof names) {
      response.clearCookie(names[name], attributes);
    },
  };
}

function refreshHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function newRefreshToken(id: ObjectId) {
  return id.toHexString() + '.' + randomBytes(32).toString('base64url');
}

export function createSessionManager(db: Db, config: AuthConfig) {
  const accounts = db.collection<Account>('users');
  const sessions = db.collection<Session>('authSessions');
  const cookies = createAuthCookies(config);
  const active = () => ({ revokedAt: null, expiresAt: { $gt: new Date() } });

  async function accessClaims(request: Request) {
    const token = cookies.read(request, 'access');
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, config.jwtKey, {
        algorithms: ['HS256'], issuer: AUTH_ISSUER, audience: ACCESS_AUDIENCE, typ: 'JWT',
        requiredClaims: ['sub', 'sid', 'iat', 'exp'],
      });
      if (isObjectId(payload.sub) && isObjectId(payload.sid)) {
        return { userId: new ObjectId(payload.sub), sessionId: new ObjectId(payload.sid) };
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  function refreshCredential(request: Request) {
    const token = cookies.read(request, 'refresh');
    const parsed = token && /^([a-f0-9]{24})\.[A-Za-z0-9_-]{43}$/.exec(token);
    if (!token || !parsed) return undefined;
    return { _id: new ObjectId(parsed[1]), refreshTokenHash: refreshHash(token) };
  }

  async function writeCookies(response: Response, session: Session, refresh: string) {
    const lifetime = Math.max(0, session.expiresAt.getTime() - Date.now());
    const accessAge = Math.min(ACCESS_SECONDS * 1_000, lifetime);
    const access = await new SignJWT({ sid: session._id.toHexString() })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(AUTH_ISSUER)
      .setAudience(ACCESS_AUDIENCE)
      .setSubject(session.userId.toHexString())
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + accessAge) / 1_000))
      .sign(config.jwtKey);
    cookies.set(response, 'access', access, accessAge);
    cookies.set(response, 'refresh', refresh, lifetime);
  }

  async function issue(response: Response, account: Account, googleEmail?: string) {
    const id = new ObjectId();
    const refresh = newRefreshToken(id);
    const now = new Date();
    const session: Session = {
      _id: id,
      userId: account._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MILLISECONDS),
      refreshTokenHash: refreshHash(refresh),
      ...(googleEmail ? { googleEmail } : {}),
    };
    await sessions.insertOne(session);
    await writeCookies(response, session, refresh);
  }

  async function authenticate(request: Request) {
    const claims = await accessClaims(request);
    if (!claims) throw signInRequired();
    const session = await sessions.findOne({ _id: claims.sessionId, userId: claims.userId, ...active() });
    if (!session) throw signInRequired();
    const account = await accounts.findOne({ _id: claims.userId });
    if (!account) throw signInRequired();
    return { account, sessionId: claims.sessionId, googleEmail: session.googleEmail };
  }

  async function renew(request: Request, response: Response) {
    const credential = refreshCredential(request);
    if (!credential) throw signInRequired();

    const current = await sessions.findOne({ ...credential, ...active() });
    const account = current && await accounts.findOne({ _id: current.userId });
    if (!account) throw signInRequired();

    const replacement = newRefreshToken(credential._id);
    // Recheck the credential and revocation state on the write so only one renewal succeeds.
    const session = await sessions.findOneAndUpdate(
      { ...credential, ...active() },
      { $set: { refreshTokenHash: refreshHash(replacement) } },
      { returnDocument: 'after' },
    );
    if (!session) throw signInRequired();
    await writeCookies(response, session, replacement);
    return account;
  }

  async function logout(request: Request, response: Response) {
    const claims = await accessClaims(request);
    const credential = claims ? { _id: claims.sessionId, userId: claims.userId } : refreshCredential(request);
    if (credential) {
      await sessions.updateOne({ ...credential, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    cookies.clear(response, 'access');
    cookies.clear(response, 'refresh');
    cookies.clear(response, 'google');
  }

  return { issue, authenticate, renew, logout };
}
