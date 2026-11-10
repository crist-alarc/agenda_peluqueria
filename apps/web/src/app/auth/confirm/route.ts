import { verifyEmailLink } from '@agenda/auth';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { safeNext } from '@/lib/url';

/** Destino de los enlaces de los emails (confirmar cuenta, recuperar contraseña). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verified = await verifyEmailLink(await getDb(), {
    code: params.get('code'),
    tokenHash: params.get('token_hash'),
    type: params.get('type'),
  });
  const target = verified ? safeNext(params.get('next')) : '/login?error=link';
  return NextResponse.redirect(new URL(target, request.url));
}
