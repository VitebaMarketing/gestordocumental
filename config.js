/* =====================================================================
   CONFIGURACIÓN
   - Sin Supabase: la app funciona en "modo local" (datos solo en ese navegador).
   - Con Supabase: cada persona entra con su correo y contraseña desde
     cualquier equipo y todos ven los mismos documentos y firmas.
     Pega aquí la "Project URL" y la "anon public key" de tu proyecto
     (Supabase → Project Settings → API). Ver README.md.
   ===================================================================== */
window.APP_CONFIG = {
  appName: 'Circuito de firmas · Gafial Group',
  company: 'Gafial Group',
  supabaseUrl: 'https://bazyaktqolapgjommuba.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhenlha3Rxb2xhcGdqb21tdWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODAyMzYsImV4cCI6MjEwNzU1NjIzNn0.XkoVbuo6P2oEw-TRCHxqcrLbVl5EB9XfaT82rFk6e3U',
};
