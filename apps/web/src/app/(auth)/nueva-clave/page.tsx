import { Card, CardContent, CardHeader, CardTitle, Field, Input } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requireUser } from '@/lib/session';
import { newPasswordAction } from '../actions';

export const metadata = { title: 'Nueva contraseña' };

export default async function NewPasswordPage() {
  // Se llega aquí desde el enlace del email, que ya inició la sesión
  await requireUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={newPasswordAction} className="flex flex-col gap-4">
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repite la contraseña">
            <Input name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton>Guardar contraseña</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
