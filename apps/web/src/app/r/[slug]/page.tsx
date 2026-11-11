import { formatClp } from '@agenda/core';
import { createServiceDbClient, getConfirmationMode, getPublicBusiness } from '@agenda/db';
import { notFound } from 'next/navigation';
import { BookingWizard } from '@/components/booking-wizard';
import { getDb } from '@/lib/db';
import { wizardDates } from '@/lib/dates';
import { bookPublic, getPublicSlots } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getPublicBusiness(await getDb(), slug);
  return { title: business ? `Reservar en ${business.name}` : 'Reservar' };
}

/** Link público de reservas del negocio (directrices, sección 9). */
export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getPublicBusiness(await getDb(), slug);
  if (!business) notFound();

  const mode = await getConfirmationMode(createServiceDbClient(), business.id);
  const getSlots = getPublicSlots.bind(null, slug);
  const book = bookPublic.bind(null, slug);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Reserva tu hora en</p>
        <h1 className="text-3xl font-semibold tracking-tight">{business.name}</h1>
        {business.branches.length === 1 && business.branches[0]?.address && (
          <p className="mt-1 text-sm text-muted-foreground">
            {[business.branches[0].address, business.branches[0].commune].filter(Boolean).join(', ')}
          </p>
        )}
      </header>
      {business.services.length === 0 ? (
        <p className="text-muted-foreground">Este negocio aún no tiene servicios disponibles para reservar.</p>
      ) : (
        <BookingWizard
          mode="public"
          businessId={business.id}
          branches={business.branches}
          services={business.services.map((s) => ({ ...s, priceLabel: formatClp(s.priceClp) }))}
          people={business.people}
          addons={business.addons.map((a) => ({ id: a.id, name: a.name, priceLabel: formatClp(a.priceClp) }))}
          dates={wizardDates(business.timezone, Math.min(business.maxAdvanceDays, 21))}
          getSlots={getSlots}
          book={book}
          emailRequired={mode === 'email'}
        />
      )}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        {business.cancellationHours > 0 &&
          `Si necesitas cancelar, avisa con al menos ${business.cancellationHours} horas de anticipación. `}
        {business.phone && `Teléfono: ${business.phone}`}
      </p>
    </main>
  );
}
