import type { TokenResult } from '@agenda/db';
import { formatMoney } from '@agenda/core';
import { Card, CardContent } from '@agenda/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDateTime } from '@/lib/dates';

const MESSAGES: Record<TokenResult['result'], { title: string; text: string }> = {
  confirmed: { title: '¡Reserva confirmada!', text: 'Gracias. Te esperamos.' },
  already_confirmed: { title: 'Tu reserva ya estaba confirmada', text: 'No necesitas hacer nada más.' },
  attending: { title: '¡Gracias por confirmar!', text: 'Te esperamos. Si algo cambia, avísanos con tiempo.' },
  already_attending: { title: 'Ya habías confirmado tu asistencia', text: 'Te esperamos. No necesitas hacer nada más.' },
  cancelled: { title: 'Reserva cancelada', text: 'El horario quedó libre. Puedes reservar otra hora cuando quieras.' },
  expired: { title: 'El plazo para confirmar venció', text: 'El horario se liberó. Puedes hacer una nueva reserva.' },
  too_late: { title: 'Ya no se puede cancelar en línea', text: 'Falta poco para tu hora: contacta directamente al negocio.' },
  invalid: { title: 'Enlace no válido', text: 'El enlace expiró o ya fue usado.' },
};

/** Resultado de usar un enlace del email (sin datos internos). */
export function TokenResultCard({ result, children }: { result: TokenResult; children?: ReactNode }) {
  const m = MESSAGES[result.result];
  const b = result.booking;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <h1 className="text-xl font-semibold">{m.title}</h1>
          <p className="text-sm text-muted-foreground">{m.text}</p>
          {b && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{b.businessName}</p>
              <p>{b.services.join(' + ')}</p>
              <p>{formatDateTime(b.startsAt, b.timezone)}</p>
              <p className="text-muted-foreground">{formatMoney(b.total, b.currency)}</p>
            </div>
          )}
          {b?.businessSlug && (result.result === 'cancelled' || result.result === 'expired') && (
            <Link href={`/r/${b.businessSlug}`} className="inline-block text-sm font-medium underline">
              Reservar otra hora
            </Link>
          )}
          {children}
        </CardContent>
      </Card>
    </main>
  );
}
