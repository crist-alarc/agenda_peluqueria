import { BILLING_DOCUMENTS, formatRut } from '@agenda/core';
import { PageHeader } from '@agenda/ui';
import { notFound } from 'next/navigation';
import { BillingProfileForm } from '@/components/billing-profile-form';
import { getBillingState, requireBusiness } from '@/lib/session';
import { saveBillingProfileAction } from './actions';

export const metadata = { title: 'Facturación' };

const longDate = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/** Datos con los que la plataforma le emite la boleta o factura al negocio (ADR 0010). Solo el dueño. */
export default async function BillingPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business, membership } = await requireBusiness(businessId);
  if (membership.role !== 'owner') notFound();
  const billing = await getBillingState(business.id);
  if (!billing) notFound();
  const profile = billing.profile;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Facturación"
        description="Los datos con que te emitimos la boleta o factura de tu plan. Puedes cambiarlos cuando quieras; aplican a los documentos que se emitan desde ahora."
      />
      {!profile && (
        <p className="mb-6 text-sm">
          {billing.status === 'blocked'
            ? 'El plazo para completarlos venció y el panel quedó en pausa. Apenas los guardes, todo vuelve a funcionar.'
            : `Tienes hasta el ${longDate(billing.graceUntil)} para completarlos.`}
          {billing.suggestion && ` Los rellenamos con los de ${billing.suggestion.fromBusiness}; revisa que sirvan para este negocio.`}
        </p>
      )}
      {profile && (
        <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Documento</dt>
          <dd>{BILLING_DOCUMENTS[profile.documentType]}</dd>
          <dt className="text-muted-foreground">{profile.documentType === 'boleta' ? 'Nombre' : 'Razón social'}</dt>
          <dd>{profile.legalName}</dd>
          {profile.taxId && (
            <>
              <dt className="text-muted-foreground">{profile.country === 'CL' ? 'RUT' : 'Identificación'}</dt>
              <dd className="tabular-nums">{profile.country === 'CL' ? formatRut(profile.taxId) : profile.taxId}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Email</dt>
          <dd>{profile.email}</dd>
        </dl>
      )}
      <BillingProfileForm
        action={saveBillingProfileAction}
        businessId={business.id}
        initial={profile ?? billing.suggestion}
        submitLabel={profile ? 'Guardar cambios' : 'Guardar datos de facturación'}
      />
    </div>
  );
}
