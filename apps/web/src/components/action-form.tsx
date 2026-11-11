'use client';

import { Alert, Button, type ButtonProps } from '@agenda/ui';
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react';

const PendingContext = createContext(false);

export type ActionState = { ok: boolean; message: string } | null;
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Formulario conectado a una Server Action. Muestra el mensaje de error o de
 * éxito que devuelve el servidor. No contiene lógica de negocio.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  'aria-label': ariaLabel,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Si se indica, pide confirmación antes de enviar. */
  confirm?: string;
  'aria-label'?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      aria-label={ariaLabel}
      aria-busy={pending}
      onSubmit={(e) => {
        // Se envía manualmente para que React no vacíe los campos cuando el
        // servidor responde con un error (la persona no pierde lo escrito).
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state && (
        <Alert variant={state.ok ? 'success' : 'destructive'} className="mt-3">
          {state.message}
        </Alert>
      )}
    </form>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? 'Guardando…' : children}
    </Button>
  );
}
