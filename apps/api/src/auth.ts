import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '@ai-chat/contracts';

export type AccessClaims = {
  sub: string;
  email?: string;
  name?: string;
  avatar?: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string;
    claims: AccessClaims;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export function assertRuntimeIsProductionSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.AI_CHAT_TEST_JWT_SECRET || process.env.AI_CHAT_STORAGE === 'memory' || process.env.AI_CHAT_MODEL_ADAPTER) {
    throw new Error('Test adapters and test tokens cannot start in production');
  }
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  assertRuntimeIsProductionSafe();
  const audience = 'authenticated';
  const testSecret = process.env.AI_CHAT_TEST_JWT_SECRET;
  if (testSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Test tokens cannot be verified in production');
    }
    const issuer = process.env.AI_CHAT_TEST_JWT_ISSUER ?? 'http://localhost/auth/v1';
    const { payload } = await jwtVerify(token, new TextEncoder().encode(testSecret), { issuer, audience });
    return claimsFrom(payload.sub, payload);
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const issuer = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : undefined;
  if (!issuer) throw new AppError(401, 'UNAUTHENTICATED', 'Sign-in is not configured');
  if (process.env.SUPABASE_JWT_SECRET) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET), {
      issuer,
      audience,
    });
    return claimsFrom(payload.sub, payload);
  }
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  return claimsFrom(payload.sub, payload);
}

function claimsFrom(sub: unknown, payload: Record<string, unknown>): AccessClaims {
  if (typeof sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(sub)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session is not valid');
  }
  const metadata = (payload.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; email?: string };
  const email = typeof payload.email === 'string' ? payload.email : metadata.email;
  return {
    sub,
    email,
    name: metadata.full_name ?? metadata.name,
    avatar: allowAvatar(metadata.avatar_url),
  };
}

function allowAvatar(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname!=='googleusercontent.com'&&!url.hostname.endsWith('.googleusercontent.com')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
