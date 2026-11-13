'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Con el plazo de facturación vencido (ADR 0010) el panel queda en pausa: solo se pueden ver
 * Facturación y Plan. Las acciones también se rechazan en el servidor (requireWritableBusiness).
 */
export function BillingGate({ base, blocked, gate, children }: { base: string; blocked: boolean; gate: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const allowed = !blocked || [`${base}/facturacion`, `${base}/plan`].some((p) => path === p || path.startsWith(`${p}/`));
  // Siempre el mismo árbol: al completar los datos la página no se vuelve a montar y el formulario
  // conserva su mensaje de confirmación.
  return <>{allowed ? children : gate}</>;
}
