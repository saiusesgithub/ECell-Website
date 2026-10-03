import crypto from 'node:crypto';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signingKey() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Ticket access signing key is not configured.');
  return key;
}

function signature(payload) {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function createTicketAccessToken(ticketIds) {
  const ids = [...new Set(ticketIds)];
  if (!ids.length || ids.length > 100 || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Cannot create access for invalid ticket IDs.');
  }

  const payload = Buffer.from(JSON.stringify({ ids, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function verifyTicketAccessToken(token) {
  if (typeof token !== 'string' || token.length > 16_384) return null;

  const [payload, providedSignature, ...extra] = token.split('.');
  if (!payload || !providedSignature || extra.length) return null;

  const expected = signature(payload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
    if (!Array.isArray(claims.ids) || claims.ids.length < 1 || claims.ids.length > 100) return null;
    if (claims.ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) return null;
    if (new Set(claims.ids).size !== claims.ids.length) return null;
    return claims.ids;
  } catch {
    return null;
  }
}
