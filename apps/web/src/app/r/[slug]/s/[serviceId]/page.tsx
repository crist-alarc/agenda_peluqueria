import { catalogPhotoUrl, getPublicBusiness } from '@agenda/db';
import { Badge } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { durationLabel, priceLabel, serviceDetails } from '@/lib/catalog';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ slug: string; serviceId: string }> };

async function load({ params }: Params) {
  const { slug, serviceId } = await params;
  const business = await getPublicBusiness(await getDb(), slug);
  const service = business?.services.find((s) => s.id === serviceId);
  return business && service ? { business, service } : null;
}

export async function generateMetadata(props: Params) {
  const data = await load(props);
  return { title: data ? `${data.service.name} · ${data.business.name}` : 'Catálogo' };
}

/** Ficha de un servicio del catálogo público (fase 3A): fotos, datos y precio. */
export default async function ServiceDetailPage(props: Params) {
  const data = await load(props);
  if (!data) notFound();
  const { business, service } = data;
  const price = priceLabel(service.price, business.currency);
  const details = serviceDetails(business, service);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/r/${business.slug}`} className="text-sm underline underline-offset-2">
        ← Volver a {business.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{service.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{durationLabel(business, service)}</Badge>
        {price && <span className="text-base font-semibold text-foreground">{price}</span>}
      </p>

      {service.photos.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Fotos">
          {service.photos.map((path, i) => (
            <li key={path} className={i === 0 ? 'col-span-2 sm:col-span-3' : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- foto pública del catálogo */}
              <img
                src={catalogPhotoUrl(path)}
                alt={`${service.name}, foto ${i + 1}`}
                className={i === 0 ? 'aspect-video w-full rounded-lg object-cover' : 'aspect-square w-full rounded-md object-cover'}
              />
            </li>
          ))}
        </ul>
      )}

      {service.description && <p className="mt-5">{service.description}</p>}

      {details.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-4 text-sm">
          {details.map((d) => (
            <div key={d.key}>
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Link
        href={`/r/${business.slug}`}
        className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Reservar
      </Link>
    </main>
  );
}
