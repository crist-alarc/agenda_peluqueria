export default function ConfigWarning() {
  return (
    <main className="container narrow">
      <div className="card">
        <h1>Falta configurar Supabase</h1>
        <p>
          Crea un archivo <code>.env.local</code> en la raíz del proyecto (puedes copiar <code>.env.example</code>) con
          las variables:
        </p>
        <pre>
          VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=tu-anon-key
        </pre>
        <p>Luego reinicia el servidor de desarrollo.</p>
      </div>
    </main>
  );
}
