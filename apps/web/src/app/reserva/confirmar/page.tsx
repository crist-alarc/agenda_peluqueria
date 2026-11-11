import { redeemBookingToken } from '@agenda/db';
import { getDb } from '@/lib/db';
import { hashToken } from '@/lib/tokens';
import { TokenResultCard } from '../result';

export const metadata = { title: 'Confirmar reserva' };

/** Destino del botón "Confirmar reserva" del email. Confirmar es seguro de repetir. */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const result = t ? await redeemBookingToken(await getDb(), hashToken(t)) : { result: 'invalid' as const };
  return <TokenResultCard result={result} />;
}
