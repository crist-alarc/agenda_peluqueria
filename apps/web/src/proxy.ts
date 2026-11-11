import { createDbClient, readDbConfig } from '@agenda/db';
import { getCurrentUser } from '@agenda/auth';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Se ejecuta antes de cada página: renueva la sesión (cookies) y protege el panel.
 * Los permisos reales se validan en el servidor y en la base (RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const db = createDbClient(readDbConfig(), {
    getAll: () => request.cookies.getAll(),
    setAll: (toSet) => {
      for (const { name, value } of toSet) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
    },
  });

  const user = await getCurrentUser(db);
  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith('/panel') || path.startsWith('/mis-reservas'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && (path === '/login' || path === '/registro')) {
    const url = request.nextUrl.clone();
    url.pathname = '/panel';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|svg|jpg|webp)$).*)'],
};
