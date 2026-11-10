import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { signInAction } from '../actions';

export const metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
        <CardDescription>Usa tu email y contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        {error === 'link' && (
          <p className="mb-3 text-sm text-destructive">El enlace no es válido o ya expiró. Intenta de nuevo.</p>
        )}
        <ActionForm action={signInAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? '/panel'} />
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Contraseña">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton>Ingresar</SubmitButton>
        </ActionForm>
        <div className="mt-4 flex justify-between text-sm">
          <Link href="/recuperar" className="text-muted-foreground hover:underline">
            Olvidé mi contraseña
          </Link>
          <Link href="/registro" className="font-medium hover:underline">
            Crear cuenta
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
