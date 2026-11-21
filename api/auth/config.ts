export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AuthConfig {
  origin: string;
  secureCookies: boolean;
  jwtKey: Uint8Array;
  trustProxyHops?: number;
  google?: GoogleConfig;
  adminEmail?: string;
}

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig | undefined {
  const originValue = env.APP_ORIGIN?.trim();
  const signingValue = env.JWT_SIGNING_KEY?.trim();
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const googleRedirectUri = env.GOOGLE_REDIRECT_URI?.trim();
  const adminEmail = env.ARCSHIFT_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && !/^[a-z0-9.]+@gmail\.com$/.test(adminEmail)) {
    throw new Error('ARCSHIFT_ADMIN_EMAIL must be the exact verified Gmail address.');
  }
  const proxyHops = env.TRUST_PROXY_HOPS?.trim();
  if (!originValue && !signingValue && !googleClientId && !googleClientSecret && !googleRedirectUri && !proxyHops && !adminEmail) {
    return undefined;
  }

  const origin = URL.parse(originValue ?? '');
  const loopback = origin && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  const localDevelopment = origin?.protocol === 'http:' && loopback && env.NODE_ENV !== 'production';
  const originIsAllowed = origin?.protocol === 'https:' || localDevelopment;
  if (!origin || !originIsAllowed || origin.href !== origin.origin + '/') {
    throw new Error('APP_ORIGIN must be an HTTPS origin. HTTP loopback origins are allowed during development.');
  }

  const jwtKey = Buffer.from(signingValue ?? '', 'base64url');
  if (jwtKey.length < 32 || jwtKey.toString('base64url') !== signingValue) {
    throw new Error('JWT_SIGNING_KEY must be a base64url-encoded key of at least 32 bytes.');
  }

  if (proxyHops && !/^[1-5]$/.test(proxyHops)) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 1 to 5.');
  }

  let google: GoogleConfig | undefined;
  if (googleClientId || googleClientSecret || googleRedirectUri) {
    if (!googleClientId || !googleClientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together.');
    }
    const redirectUri = new URL(GOOGLE_CALLBACK_PATH, origin).href;
    if (googleRedirectUri && googleRedirectUri !== redirectUri) {
      throw new Error('GOOGLE_REDIRECT_URI must use APP_ORIGIN and the Google callback path.');
    }
    google = { clientId: googleClientId, clientSecret: googleClientSecret, redirectUri };
  }

  return {
    origin: origin.origin,
    secureCookies: origin.protocol === 'https:',
    jwtKey,
    trustProxyHops: proxyHops ? Number(proxyHops) : undefined,
    google,
    adminEmail,
  };
}
