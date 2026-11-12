'use client';

import { cn } from '@agenda/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({
  href,
  exact,
  children,
  variant = 'panel',
}: {
  href: string;
  exact?: boolean;
  children: ReactNode;
  /** 'platform': sobre la franja pino de la consola de la plataforma. */
  variant?: 'panel' | 'platform';
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
        variant === 'panel' && 'hover:bg-accent',
        variant === 'panel' && (active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground'),
        variant === 'platform' && 'hover:bg-white/10',
        variant === 'platform' && (active ? 'bg-white/15 font-medium text-platform-foreground' : 'text-platform-foreground/75'),
      )}
    >
      {children}
    </Link>
  );
}
