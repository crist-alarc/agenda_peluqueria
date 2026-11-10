import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '@/lib/texts';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 self-center text-lg font-semibold">
        <img src="/icon.svg" alt="" className="size-8" />
        {t.appName}
      </Link>
      {children}
    </main>
  );
}
