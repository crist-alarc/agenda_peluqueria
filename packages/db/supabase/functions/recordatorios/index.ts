/**
 * Edge Function "recordatorios" (ADR 0004).
 *
 * Supabase Cron la llama cada 15 minutos. No contiene lógica: solo avisa a la
 * app, que decide con @agenda/core qué recordatorios enviar. Así la lógica vive
 * en un solo lugar, con sus tests, y cambiar de proveedor de tareas programadas
 * es cambiar solo este archivo.
 *
 * Secretos de la función (Supabase → Edge Functions → Secrets):
 *   APP_URL      URL pública de la app, ej. https://agenda-peluqueria-virid.vercel.app
 *   CRON_SECRET  el mismo valor que CRON_SECRET en Vercel
 */
Deno.serve(async () => {
  const appUrl = Deno.env.get('APP_URL');
  const secret = Deno.env.get('CRON_SECRET');
  if (!appUrl || !secret) {
    return Response.json({ error: 'Faltan APP_URL o CRON_SECRET en los secretos de la función' }, { status: 500 });
  }
  const res = await fetch(`${appUrl.replace(/\/$/, '')}/api/tareas/recordatorios`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
});
