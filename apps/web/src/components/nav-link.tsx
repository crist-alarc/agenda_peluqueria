'use client';

import { cn } from '@agenda/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        'whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
        active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </Link>
  );
}
