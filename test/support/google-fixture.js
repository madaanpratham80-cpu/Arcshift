import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createGoogleProvider } from '../../dist/auth/google.js';

export async function createGoogleFixture(config) {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test-google-key', alg: 'RS256' }] });
  const codes = new Map();

  const provider = createGoogleProvider(config, async (_url, options) => {
    const code = options.body.get('code');
    const grant = codes.get(code);
    if (!grant) return new Response(null, { status: 400 });
    codes.delete(code);
    grant.request = options;
    const segments = (await sign(grant.claims)).split('.');
    if (grant.claims.tamperSignature) {
      segments[2] = (segments[2][0] === 'A' ? 'B' : 'A') + segments[2].slice(1);
    }
    return Response.json({ id_token: segments.join('.') });
  }, keys);

  function sign(claims) {
    return new SignJWT({
      nonce: claims.nonce,
      email: claims.email ?? 'new-google@example.test',
      email_verified: claims.emailVerified ?? true,
      ...(claims.authorizedParty ? { azp: claims.authorizedParty } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-google-key' })
      .setIssuer(claims.issuer ?? 'https://accounts.google.com')
      .setAudience(claims.audience ?? config.clientId)
      .setSubject(claims.subject ?? 'test-google-subject')
      .setIssuedAt()
      .setExpirationTime(claims.expiration ?? '5 minutes')
      .sign(privateKey);
  }

  return {
    provider,
    addCode(code, claims) {
      const grant = { claims };
      codes.set(code, grant);
      return grant;
    },
  };
}
