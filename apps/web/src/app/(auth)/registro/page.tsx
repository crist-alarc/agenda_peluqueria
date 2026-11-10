import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { signUpAction } from '../actions';

export const metadata = { title: 'Crear cuenta' };

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Una sola cuenta para administrar tus negocios, trabajar o reservar.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={signUpAction} className="flex flex-col gap-4">
          <Field label="Tu nombre">
            <Input name="fullName" autoComplete="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton>Crear cuenta</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Ingresar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
