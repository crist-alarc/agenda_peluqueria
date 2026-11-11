import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** Token aleatorio para enlaces de email. En la base solo se guarda su hash. */
export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
