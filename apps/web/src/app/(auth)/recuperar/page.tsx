import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requestResetAction } from '../actions';

export const metadata = { title: 'Recuperar contraseña' };

export default function ResetPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>Te enviaremos un enlace para crear una nueva.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={requestResetAction} className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <SubmitButton>Enviar enlace</SubmitButton>
        </ActionForm>
        <Link href="/login" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
          Volver a ingresar
        </Link>
      </CardContent>
    </Card>
  );
}
