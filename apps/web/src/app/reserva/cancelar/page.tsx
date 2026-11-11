import { Button } from '@agenda/ui';
import { redirect } from 'next/navigation';
import { TokenResultCard } from '../result';
import { cancelByToken } from './actions';

export const metadata = { title: 'Cancelar reserva' };

/**
 * Cancelar exige un segundo clic: algunos correos abren los enlaces
 * automáticamente para revisarlos, y eso no debe cancelar una reserva.
 */
export default async function CancelPage({ searchParams }: { searchParams: Promise<{ t?: string; hecho?: string }> }) {
  const { t, hecho } = await searchParams;
  if (!t) return <TokenResultCard result={{ result: 'invalid' }} />;
  if (hecho) {
    const result = await cancelByToken(t);
    return <TokenResultCard result={result} />;
  }
  async function confirmCancel() {
    'use server';
    redirect(`/reserva/cancelar?t=${encodeURIComponent(t!)}&hecho=1`);
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="mb-2 text-xl font-semibold">¿Cancelar tu reserva?</h1>
      <p className="mb-6 text-sm text-muted-foreground">El horario quedará libre para otra persona.</p>
      <form action={confirmCancel}>
        <Button variant="destructive" type="submit">
          Sí, cancelar reserva
        </Button>
      </form>
    </main>
  );
}
