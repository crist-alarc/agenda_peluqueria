'use server';

import { redeemBookingToken, type TokenResult } from '@agenda/db';
import { getDb } from '@/lib/db';
import { hashToken } from '@/lib/tokens';

export async function cancelByToken(token: string): Promise<TokenResult> {
  return redeemBookingToken(await getDb(), hashToken(token));
}
