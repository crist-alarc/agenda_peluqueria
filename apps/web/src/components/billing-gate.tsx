'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Con el plazo de facturación vencido (ADR 0010) el panel queda en pausa: solo se pueden ver
 * Facturación y Plan. Las acciones también se rechazan en el servidor (requireWritableBusiness).
 */
export function BillingGate({ base, gate, children }: { base: string; gate: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const allowed = [`${base}/facturacion`, `${base}/plan`].some((p) => path === p || path.startsWith(`${p}/`));
  return <>{allowed ? children : gate}</>;
}
