import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { AuthConfig, GoogleConfig } from './config.ts';
import { AUTH_ISSUER, isObjectId } from './sessions.ts';

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5_000,
});
const FLOW_AUDIENCE = 'career-agent-google-flow';
export const GOOGLE_FLOW_MS = 10 * 60 * 1_000;

const randomValue = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const flowSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('signin'), destination: z.literal('admin').optional(), state: randomValue, nonce: randomValue, verifier: randomValue }),
  z.object({
    mode: z.literal('link'),
    state: randomValue,
    nonce: randomValue,
    verifier: randomValue,
    userId: z.string().refine(isObjectId),
    sessionId: z.string().refine(isObjectId),
  }),
]);

type GoogleFlow = z.infer<typeof flowSchema>;
type Intent = { mode: 'signin'; destination?: 'admin' } | { mode: 'link'; userId: string; sessionId: string };

export function createGoogleFlow(intent: Intent): GoogleFlow {
  return {
    ...intent,
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
  };
}

export function signGoogleFlow(flow: GoogleFlow, config: AuthConfig) {
  return new SignJWT({ ...flow })
    .setProtectedHeader({ alg: 'HS256', typ: 'oauth-flow+jwt' })
    .setIssuer(AUTH_ISSUER)
    .setAudience(FLOW_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + GOOGLE_FLOW_MS) / 1_000))
    .sign(config.jwtKey);
}

export async function readGoogleFlow(token: string | undefined, config: AuthConfig) {
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, config.jwtKey, {
      algorithms: ['HS256'], issuer: AUTH_ISSUER, audience: FLOW_AUDIENCE, typ: 'oauth-flow+jwt',
      requiredClaims: ['iat', 'exp'],
    });
    const flow = flowSchema.safeParse(payload);
    return flow.success ? flow.data : undefined;
  } catch {
    return undefined;
  }
}

export interface GoogleProvider {
  authorizationUrl(flow: GoogleFlow): string;
  exchangeIdentity(code: string, flow: GoogleFlow): Promise<{ subject: string; email: string }>;
}

export function createGoogleProvider(
  config: GoogleConfig,
  request = fetch,
  keys: JWTVerifyGetKey = googleKeys,
): GoogleProvider {
  return {
    authorizationUrl(flow) {
      const url = new URL(GOOGLE_AUTHORIZATION_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid email',
        prompt: 'select_account',
        state: flow.state,
        nonce: flow.nonce,
        code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      return url.href;
    },

    async exchangeIdentity(code, flow) {
      const response = await request(GOOGLE_TOKEN_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code,
          code_verifier: flow.verifier,
        }),
      });
      if (!response.ok) throw new Error('Google token exchange failed.');
      const body: unknown = await response.json();
      const token = z.object({ id_token: z.string().max(16_384) }).parse(body).id_token;
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ['RS256'],
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: config.clientId,
        requiredClaims: ['exp', 'iat', 'sub', 'nonce', 'email', 'email_verified'],
        maxTokenAge: '10 minutes',
      });
      const multipleAudiences = Array.isArray(payload.aud) && payload.aud.length > 1;
      const hasAuthorizedParty = payload.azp !== undefined;
      if (payload.nonce !== flow.nonce || payload.email_verified !== true ||
          ((multipleAudiences || hasAuthorizedParty) && payload.azp !== config.clientId) ||
          typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
          typeof payload.email !== 'string') {
        throw new Error('Google identity claims are invalid.');
      }
      return { subject: payload.sub, email: payload.email };
    },
  };
}
